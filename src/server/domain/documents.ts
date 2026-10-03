import type { PrismaClient } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { splitGross } from "@/lib/format";
import { addDocument, record, takeNumber } from "@/server/domain/platform";
import { postJournal } from "@/server/domain/ledger";

type Actor = { organizationId: string; actorId: string; at?: Date };

const LIVE = ["issued", "partial", "paid", "draft"];

function dueFromTerms(terms: string, issued: Date) {
  const days = /sofort|immediate/i.test(terms) ? 0 : Number(terms.match(/(\d+)/)?.[1] ?? 14);
  const due = new Date(issued);
  due.setUTCDate(due.getUTCDate() + (Number.isFinite(days) ? days : 14));
  return due;
}

async function copyLines(tx: Tx, sourceId: string, targetId: string) {
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId: sourceId } });
  for (const line of lines) {
    await tx.invoiceLine.create({
      data: {
        invoiceId: targetId,
        variantId: line.variantId,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        taxRateBps: line.taxRateBps,
      },
    });
  }
}

async function bookReversal(tx: Tx, input: Actor & { number: string; net: number; tax: number; gross: number; sourceId: string; restore?: boolean }) {
  const lines = input.restore
    ? [
        { code: "1400", debitCents: input.gross },
        { code: "4000", creditCents: input.net },
        { code: "3800", creditCents: input.tax },
      ]
    : [
        { code: "4000", debitCents: input.net },
        { code: "3800", debitCents: input.tax },
        { code: "1400", creditCents: input.gross },
      ];
  await postJournal(tx, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    memo: input.number,
    sourceType: "invoice",
    sourceId: input.sourceId,
    at: input.at,
    lines,
  });
}

type ContraKind = "cancellation" | "credit" | "credit_cancellation";

const sequenceFor: Record<ContraKind, string> = {
  cancellation: "invoice_cancellation",
  credit: "credit",
  credit_cancellation: "credit_cancellation",
};

const titleFor: Record<ContraKind, string> = {
  cancellation: "Cancellation invoice",
  credit: "Credit note",
  credit_cancellation: "Cancellation of credit note",
};

async function issueContra(tx: Tx, input: Actor & { invoiceId: string; kind: ContraKind }) {
  const source = await tx.invoice.findFirst({
    where: { id: input.invoiceId, organizationId: input.organizationId },
    include: { correctedBy: true, salesOrder: true },
  });
  if (!source) throw new Error("Invoice not found.");
  if (source.status === "cancelled" || source.status === "void") throw new Error("This document is already cancelled.");
  if (input.kind === "credit_cancellation") {
    if (source.kind !== "credit") throw new Error("Only a credit note can be cancelled this way.");
  } else if (source.kind !== "invoice") {
    throw new Error("Only an invoice can be cancelled or corrected.");
  }
  const openChild = source.correctedBy.find((item) => item.kind === input.kind && !["cancelled", "void"].includes(item.status));
  if (openChild) throw new Error("This document already exists.");
  if (input.kind === "cancellation") {
    const credit = source.correctedBy.find((item) => item.kind === "credit" && !["cancelled", "void"].includes(item.status));
    if (credit) throw new Error("Cancel the credit note first.");
  }
  const at = input.at ?? new Date();
  const number = await takeNumber(tx, input.organizationId, sequenceFor[input.kind]);
  const created = await tx.invoice.create({
    data: {
      organizationId: input.organizationId,
      number,
      customerId: source.customerId,
      salesOrderId: source.salesOrderId,
      kind: input.kind,
      correctsId: source.id,
      status: "issued",
      currency: source.currency,
      netCents: source.netCents,
      taxCents: source.taxCents,
      totalCents: source.totalCents,
      issuedAt: at,
      dueAt: null,
      createdAt: at,
    },
  });
  await copyLines(tx, source.id, created.id);
  await bookReversal(tx, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    at,
    number,
    net: source.netCents,
    tax: source.taxCents,
    gross: source.totalCents,
    sourceId: created.id,
    restore: input.kind === "credit_cancellation",
  });
  if (input.kind !== "credit") {
    await tx.invoice.update({ where: { id: source.id }, data: { status: "cancelled" } });
  }
  const label = titleFor[input.kind];
  await record(tx, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    type: `invoice.${input.kind}`,
    entityType: "invoice",
    entityId: created.id,
    summary: `${number} for ${source.number}`,
    at,
  });
  if (source.salesOrderId) {
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: `invoice.${input.kind}`,
      entityType: "sales_order",
      entityId: source.salesOrderId,
      summary: `${label} ${number}`,
      at,
    });
  }
  await addDocument(tx, {
    organizationId: input.organizationId,
    title: `${label} ${number}`,
    kind: input.kind,
    entityType: "invoice",
    entityId: created.id,
    filename: `${number}.pdf`,
    at,
  });
  return created;
}

export async function createCancellation(db: PrismaClient, input: Actor & { invoiceId: string }) {
  return db.$transaction((tx) => issueContra(tx, { ...input, kind: "cancellation" }));
}

export async function createCreditNote(db: PrismaClient, input: Actor & { invoiceId: string }) {
  return db.$transaction((tx) => issueContra(tx, { ...input, kind: "credit" }));
}

export async function createCreditCancellation(db: PrismaClient, input: Actor & { invoiceId: string }) {
  return db.$transaction((tx) => issueContra(tx, { ...input, kind: "credit_cancellation" }));
}

export async function reverseLiveDocuments(tx: Tx, input: Actor & { salesOrderId: string }) {
  const invoices = await tx.invoice.findMany({
    where: { organizationId: input.organizationId, salesOrderId: input.salesOrderId },
    include: { correctedBy: true },
  });
  const live = (kind: string) => invoices.filter((item) => item.kind === kind && LIVE.includes(item.status));
  for (const credit of live("credit")) {
    await issueContra(tx, { ...input, invoiceId: credit.id, kind: "credit_cancellation" });
  }
  for (const invoice of live("invoice")) {
    await issueContra(tx, { ...input, invoiceId: invoice.id, kind: "cancellation" });
  }
}

export async function setOrderPriority(db: PrismaClient, input: Actor & { salesOrderId: string; priority: string }) {
  const allowed = ["low", "normal", "high", "urgent"];
  if (!allowed.includes(input.priority)) throw new Error("Unknown priority.");
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({ where: { id: input.salesOrderId, organizationId: input.organizationId } });
    if (!order) throw new Error("Order not found.");
    if (order.status === "cancelled") throw new Error("This order is cancelled.");
    await tx.salesOrder.update({ where: { id: order.id }, data: { priority: input.priority } });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "sales_order.priority",
      entityType: "sales_order",
      entityId: order.id,
      summary: `${order.number} priority ${input.priority}`,
      at: input.at,
    });
  });
}

export async function setOrderHold(db: PrismaClient, input: Actor & { salesOrderId: string; onHold: boolean }) {
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({ where: { id: input.salesOrderId, organizationId: input.organizationId } });
    if (!order) throw new Error("Order not found.");
    if (order.status === "cancelled" || order.status === "completed") throw new Error("This order can no longer be held.");
    await tx.salesOrder.update({ where: { id: order.id }, data: { onHold: input.onHold } });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: input.onHold ? "sales_order.held" : "sales_order.released",
      entityType: "sales_order",
      entityId: order.id,
      summary: input.onHold ? `${order.number} on hold` : `${order.number} released`,
      at: input.at,
    });
  });
}

export async function completeSalesOrder(db: PrismaClient, input: Actor & { salesOrderId: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({ where: { id: input.salesOrderId, organizationId: input.organizationId } });
    if (!order) throw new Error("Order not found.");
    if (order.status === "cancelled") throw new Error("A cancelled order cannot be completed.");
    if (order.onHold) throw new Error("Release the order first.");
    if (order.status === "completed") throw new Error("This order is already completed.");
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: "completed" } });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "sales_order.completed",
      entityType: "sales_order",
      entityId: order.id,
      summary: `${order.number} completed`,
      at: input.at,
    });
  });
}

export async function createQuoteFromOrder(db: PrismaClient, input: Actor & { salesOrderId: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: input.salesOrderId, organizationId: input.organizationId },
      include: { lines: { include: { variant: { include: { product: true } } } } },
    });
    if (!order) throw new Error("Order not found.");
    if (order.status === "cancelled") throw new Error("A cancelled order has no quote.");
    const at = input.at ?? new Date();
    let net = 0;
    let tax = 0;
    let gross = 0;
    const priced = order.lines.map((line) => {
      const amount = splitGross(line.quantity * line.unitPriceCents, line.taxRateBps);
      net += amount.net;
      tax += amount.tax;
      gross += amount.gross;
      return { line, amount };
    });
    const number = await takeNumber(tx, input.organizationId, "quote");
    const quote = await tx.quote.create({
      data: {
        organizationId: input.organizationId,
        number,
        customerId: order.customerId,
        salesOrderId: order.id,
        status: "draft",
        currency: order.currency,
        netCents: net,
        taxCents: tax,
        totalCents: gross,
        issuedAt: at,
        createdAt: at,
      },
    });
    for (const item of priced) {
      await tx.quoteLine.create({
        data: {
          quoteId: quote.id,
          description: `${item.line.variant.product.name} · ${item.line.variant.name}`,
          quantity: item.line.quantity,
          unitPriceCents: item.line.unitPriceCents,
          taxRateBps: item.line.taxRateBps,
        },
      });
    }
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "quote.created",
      entityType: "quote",
      entityId: quote.id,
      summary: `${number} from ${order.number}`,
      at,
    });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "quote.created",
      entityType: "sales_order",
      entityId: order.id,
      summary: `Quote ${number}`,
      at,
    });
    await addDocument(tx, {
      organizationId: input.organizationId,
      title: `Quote ${number}`,
      kind: "quote",
      entityType: "quote",
      entityId: quote.id,
      filename: `${number}.pdf`,
      at,
    });
    return quote;
  });
}

export { dueFromTerms };
