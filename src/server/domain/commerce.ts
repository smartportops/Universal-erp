import type { PrismaClient } from "@prisma/client";
import { splitGross } from "@/lib/format";
import {
  addDocument,
  defaultStockLocation,
  defaultTaxBps,
  record,
  takeNumber,
} from "@/server/domain/platform";
import { bookCogs, bookInventoryReceipt, bookReturnToStock, postJournal, writeMovement } from "@/server/domain/ledger";
import { dueFromTerms, reverseLiveDocuments } from "@/server/domain/documents";

type Actor = { organizationId: string; actorId: string; at?: Date };

export async function createPurchaseOrder(
  db: PrismaClient,
  input: Actor & {
    supplierId: string;
    warehouseId: string;
    expectedAt?: Date | null;
    notes?: string;
    lines: { variantId: string; quantity: number; unitCostCents?: number }[];
  },
) {
  if (input.lines.length === 0) throw new Error("Mindestens eine Position.");
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, organizationId: input.organizationId },
    });
    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId: input.organizationId },
    });
    if (!supplier || !warehouse) throw new Error("Lieferant oder Lager fehlt.");
    const number = await takeNumber(tx, input.organizationId, "purchase_order");
    const at = input.at ?? new Date();
    const order = await tx.purchaseOrder.create({
      data: {
        organizationId: input.organizationId,
        number,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        status: "draft",
        expectedAt: input.expectedAt ?? null,
        notes: input.notes ?? "",
        createdAt: at,
      },
    });
    for (const line of input.lines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("Menge ist ungültig.");
      const variant = await tx.productVariant.findFirst({
        where: { id: line.variantId, organizationId: input.organizationId },
      });
      if (!variant) throw new Error("Artikel nicht gefunden.");
      await tx.purchaseOrderLine.create({
        data: {
          purchaseOrderId: order.id,
          variantId: variant.id,
          quantity: line.quantity,
          unitCostCents: line.unitCostCents ?? variant.costCents,
        },
      });
    }
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "purchase_order.created",
      entityType: "purchase_order",
      entityId: order.id,
      summary: `${number} angelegt`,
      at,
    });
    return order;
  });
}

export async function markPurchaseOrdered(db: PrismaClient, input: Actor & { purchaseOrderId: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, organizationId: input.organizationId },
    });
    if (!order) throw new Error("Bestellung nicht gefunden.");
    if (order.status !== "draft") throw new Error("Nur Entwürfe können bestellt werden.");
    const at = input.at ?? new Date();
    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: "ordered", orderedAt: at },
    });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "purchase_order.ordered",
      entityType: "purchase_order",
      entityId: order.id,
      summary: `${order.number} bestellt`,
      at,
    });
    await addDocument(tx, {
      organizationId: input.organizationId,
      title: `Bestellung ${order.number}`,
      kind: "purchase_order",
      entityType: "purchase_order",
      entityId: order.id,
      filename: `${order.number}.pdf`,
      at,
    });
    return order;
  });
}

export async function receivePurchaseOrder(db: PrismaClient, input: Actor & { purchaseOrderId: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, organizationId: input.organizationId },
      include: { lines: true },
    });
    if (!order) throw new Error("Bestellung nicht gefunden.");
    if (!["ordered", "partial"].includes(order.status)) {
      throw new Error("Wareneingang nur bei bestellten Einkäufen.");
    }
    const location = await defaultStockLocation(tx, order.warehouseId);
    const at = input.at ?? new Date();
    let cost = 0;
    let any = false;
    for (const line of order.lines) {
      const remaining = line.quantity - line.receivedQty;
      if (remaining <= 0) continue;
      any = true;
      cost += remaining * line.unitCostCents;
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQty: { increment: remaining } },
      });
      await writeMovement(tx, {
        organizationId: input.organizationId,
        variantId: line.variantId,
        warehouseId: order.warehouseId,
        locationId: location.id,
        quantity: remaining,
        type: "receipt",
        referenceType: "purchase_order",
        referenceId: order.id,
        referenceLabel: order.number,
        reason: `Wareneingang ${order.number}`,
        actorId: input.actorId,
        at,
      });
    }
    if (!any) throw new Error("Nichts mehr einzubuchen.");
    await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "received" } });
    await bookInventoryReceipt(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      amountCents: cost,
      memo: `Wareneingang ${order.number}`,
      sourceId: order.id,
      at,
    });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "purchase_order.received",
      entityType: "purchase_order",
      entityId: order.id,
      summary: `${order.number} vollständig eingebucht`,
      at,
    });
    await addDocument(tx, {
      organizationId: input.organizationId,
      title: `Wareneingang ${order.number}`,
      kind: "goods_receipt",
      entityType: "purchase_order",
      entityId: order.id,
      filename: `${order.number}-we.pdf`,
      at,
    });
    return order;
  });
}

export async function createSalesOrder(
  db: PrismaClient,
  input: Actor & {
    customerId: string;
    warehouseId: string;
    channel: string;
    promisedAt?: Date | null;
    externalRef?: string;
    notes?: string;
    lines: { variantId: string; quantity: number; unitPriceCents?: number }[];
  },
) {
  if (input.lines.length === 0) throw new Error("Mindestens eine Position.");
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, organizationId: input.organizationId },
    });
    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId: input.organizationId },
    });
    if (!customer || !warehouse) throw new Error("Kunde oder Lager fehlt.");
    const tax = await defaultTaxBps(tx, input.organizationId);
    const number = await takeNumber(tx, input.organizationId, "sales_order");
    const at = input.at ?? new Date();
    const order = await tx.salesOrder.create({
      data: {
        organizationId: input.organizationId,
        number,
        customerId: customer.id,
        warehouseId: warehouse.id,
        channel: input.channel,
        status: "confirmed",
        externalRef: input.externalRef ?? "",
        orderedAt: at,
        promisedAt: input.promisedAt ?? null,
        notes: input.notes ?? "",
        createdAt: at,
      },
    });
    for (const line of input.lines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("Menge ist ungültig.");
      const variant = await tx.productVariant.findFirst({
        where: { id: line.variantId, organizationId: input.organizationId },
        include: { product: { include: { taxRate: true } } },
      });
      if (!variant) throw new Error("Artikel nicht gefunden.");
      await tx.salesOrderLine.create({
        data: {
          salesOrderId: order.id,
          variantId: variant.id,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents ?? variant.priceCents,
          taxRateBps: variant.product.taxRate?.rateBps ?? tax,
        },
      });
    }
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "sales_order.created",
      entityType: "sales_order",
      entityId: order.id,
      summary: `${number} bestätigt`,
      at,
    });
    return order;
  });
}

export async function markPicking(db: PrismaClient, input: Actor & { salesOrderId: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: input.salesOrderId, organizationId: input.organizationId },
    });
    if (!order) throw new Error("Auftrag nicht gefunden.");
    if (order.onHold) throw new Error("This order is on hold.");
    if (order.status !== "confirmed") throw new Error("Nur bestätigte Aufträge gehen in die Kommissionierung.");
    const at = input.at ?? new Date();
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: "picking" } });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "sales_order.picking",
      entityType: "sales_order",
      entityId: order.id,
      summary: `${order.number} in Kommissionierung`,
      at,
    });
  });
}

export async function cancelSalesOrder(db: PrismaClient, input: Actor & { salesOrderId: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: input.salesOrderId, organizationId: input.organizationId },
      include: { lines: true },
    });
    if (!order) throw new Error("Order not found.");
    if (order.status === "cancelled") throw new Error("This order is already cancelled.");
    if (order.status === "completed") throw new Error("A completed order cannot be cancelled.");
    const at = input.at ?? new Date();
    const shipped = order.lines.some((line) => line.shippedQty > 0);
    await reverseLiveDocuments(tx, { ...input, at });
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: "cancelled", onHold: false } });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "sales_order.cancelled",
      entityType: "sales_order",
      entityId: order.id,
      summary: shipped ? `${order.number} cancelled after shipping` : `${order.number} cancelled`,
      body: shipped ? "Issued invoices were reversed with a cancellation document. Stock that already left stays in the ledger until a return is booked." : "",
      at,
    });
  });
}

export async function shipSalesOrder(
  db: PrismaClient,
  input: Actor & {
    salesOrderId: string;
    carrier: string;
    trackingNumber?: string;
    quantitiesByVariant?: Record<string, number>;
  },
) {
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: input.salesOrderId, organizationId: input.organizationId },
      include: { lines: { include: { variant: true } } },
    });
    if (!order) throw new Error("Auftrag nicht gefunden.");
    if (order.onHold) throw new Error("This order is on hold.");
    if (!["confirmed", "picking", "partial"].includes(order.status)) {
      throw new Error("Auftrag kann so nicht versendet werden.");
    }
    const carrier = input.carrier.trim();
    if (!carrier) throw new Error("Carrier fehlt.");
    const location = await defaultStockLocation(tx, order.warehouseId);
    const at = input.at ?? new Date();
    const planned = order.lines
      .map((line) => {
        const remaining = line.quantity - line.shippedQty;
        const requested = input.quantitiesByVariant
          ? (input.quantitiesByVariant[line.variantId] ?? 0)
          : remaining;
        return { line, qty: requested, remaining };
      })
      .filter((item) => item.qty > 0);
    if (planned.length === 0) throw new Error("Nichts mehr zu versenden.");
    for (const item of planned) {
      if (!Number.isInteger(item.qty) || item.qty > item.remaining) {
        throw new Error("Versandmenge ist ungültig.");
      }
    }
    const number = await takeNumber(tx, input.organizationId, "shipment");
    const shipment = await tx.shipment.create({
      data: {
        organizationId: input.organizationId,
        number,
        salesOrderId: order.id,
        warehouseId: order.warehouseId,
        status: "shipped",
        carrier,
        trackingNumber: input.trackingNumber?.trim() ?? "",
        shippedAt: at,
        createdAt: at,
      },
    });
    let cost = 0;
    for (const item of planned) {
      cost += item.qty * item.line.variant.costCents;
      await tx.shipmentLine.create({
        data: {
          shipmentId: shipment.id,
          salesOrderLineId: item.line.id,
          variantId: item.line.variantId,
          quantity: item.qty,
          unitCostCents: item.line.variant.costCents,
        },
      });
      await tx.salesOrderLine.update({
        where: { id: item.line.id },
        data: { shippedQty: { increment: item.qty } },
      });
      await writeMovement(tx, {
        organizationId: input.organizationId,
        variantId: item.line.variantId,
        warehouseId: order.warehouseId,
        locationId: location.id,
        quantity: -item.qty,
        type: "shipment",
        referenceType: "shipment",
        referenceId: shipment.id,
        referenceLabel: `${number} · ${order.number}`,
        reason: `Warenausgang ${order.number}`,
        actorId: input.actorId,
        at,
      });
    }
    const fresh = await tx.salesOrderLine.findMany({ where: { salesOrderId: order.id } });
    const complete = fresh.every((line) => line.shippedQty >= line.quantity);
    await tx.salesOrder.update({
      where: { id: order.id },
      data: { status: complete ? "shipped" : "partial" },
    });
    await bookCogs(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      amountCents: cost,
      memo: `Warenausgang ${number}`,
      sourceId: shipment.id,
      at,
    });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "sales_order.shipped",
      entityType: "sales_order",
      entityId: order.id,
      summary: `${order.number} · Sendung ${number} mit ${carrier}`,
      at,
    });
    await addDocument(tx, {
      organizationId: input.organizationId,
      title: `Lieferschein ${number}`,
      kind: "delivery_note",
      entityType: "shipment",
      entityId: shipment.id,
      filename: `${number}.pdf`,
      at,
    });
    return shipment;
  });
}

export async function markDelivered(db: PrismaClient, input: Actor & { salesOrderId: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: input.salesOrderId, organizationId: input.organizationId },
    });
    if (!order) throw new Error("Auftrag nicht gefunden.");
    if (!["shipped", "partial"].includes(order.status)) {
      throw new Error("Nur versendete Aufträge können zugestellt werden.");
    }
    if (order.status === "partial") throw new Error("Der Auftrag ist noch nicht vollständig versendet.");
    const at = input.at ?? new Date();
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: "delivered" } });
    await tx.shipment.updateMany({
      where: { salesOrderId: order.id, status: "shipped" },
      data: { status: "delivered", deliveredAt: at },
    });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "sales_order.delivered",
      entityType: "sales_order",
      entityId: order.id,
      summary: `${order.number} zugestellt`,
      at,
    });
  });
}

export async function issueInvoice(
  db: PrismaClient,
  input: Actor & { salesOrderId: string; dueAt?: Date | null },
) {
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: input.salesOrderId, organizationId: input.organizationId },
      include: { lines: { include: { variant: { include: { product: true } } } }, invoices: true, customer: true },
    });
    if (!order) throw new Error("Auftrag nicht gefunden.");
    if (order.status === "cancelled" || order.status === "completed") throw new Error("This order cannot be invoiced.");
    if (order.onHold) throw new Error("Release the order before invoicing it.");
    if (order.lines.length === 0) throw new Error("The order has no lines.");
    if (order.invoices.some((invoice) => (invoice.kind ?? "invoice") === "invoice" && !["cancelled", "void"].includes(invoice.status))) {
      throw new Error("This order already has an invoice.");
    }
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
    const number = await takeNumber(tx, input.organizationId, "invoice");
    const dueAt = input.dueAt ?? dueFromTerms(order.customer.paymentTerms, at);
    const invoice = await tx.invoice.create({
      data: {
        organizationId: input.organizationId,
        number,
        customerId: order.customerId,
        salesOrderId: order.id,
        kind: "invoice",
        status: "issued",
        netCents: net,
        taxCents: tax,
        totalCents: gross,
        issuedAt: at,
        dueAt,
        createdAt: at,
      },
    });
    for (const item of priced) {
      await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          variantId: item.line.variantId,
          description: `${item.line.variant.product.name} · ${item.line.variant.name}`,
          quantity: item.line.quantity,
          unitPriceCents: item.line.unitPriceCents,
          taxRateBps: item.line.taxRateBps,
        },
      });
    }
    await postJournal(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      memo: `Rechnung ${number}`,
      sourceType: "invoice",
      sourceId: invoice.id,
      at,
      lines: [
        { code: "1400", debitCents: gross },
        { code: "4000", creditCents: net },
        { code: "3800", creditCents: tax },
      ],
    });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "invoice.issued",
      entityType: "invoice",
      entityId: invoice.id,
      summary: `${number} aus ${order.number} gestellt`,
      at,
    });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "invoice.issued",
      entityType: "sales_order",
      entityId: order.id,
      summary: `Rechnung ${number} gestellt`,
      at,
    });
    await addDocument(tx, {
      organizationId: input.organizationId,
      title: `Rechnung ${number}`,
      kind: "invoice",
      entityType: "invoice",
      entityId: invoice.id,
      filename: `${number}.pdf`,
      at,
    });
    return invoice;
  });
}

export async function settlePayment(
  db: PrismaClient,
  input: Actor & { invoiceId: string; amountCents: number; method: string; reference?: string },
) {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organizationId: input.organizationId },
      include: { payments: true },
    });
    if (!invoice) throw new Error("Rechnung nicht gefunden.");
    if (invoice.kind !== "invoice") throw new Error("Only an invoice can take a payment.");
    if (!["issued", "partial"].includes(invoice.status)) throw new Error("Rechnung ist nicht offen.");
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Betrag ist ungültig.");
    const paid = invoice.payments
      .filter((payment) => payment.status === "settled")
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const open = invoice.totalCents - paid;
    if (input.amountCents > open) throw new Error("Betrag liegt über dem offenen Saldo.");
    const at = input.at ?? new Date();
    await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        invoiceId: invoice.id,
        amountCents: input.amountCents,
        method: input.method,
        reference: input.reference ?? "",
        status: "settled",
        paidAt: at,
        createdAt: at,
      },
    });
    const nextPaid = paid + input.amountCents;
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: nextPaid >= invoice.totalCents ? "paid" : "partial" },
    });
    await postJournal(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      memo: `Zahlung ${invoice.number}`,
      sourceType: "payment",
      sourceId: invoice.id,
      at,
      lines: [
        { code: "1200", debitCents: input.amountCents },
        { code: "1400", creditCents: input.amountCents },
      ],
    });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "payment.settled",
      entityType: "invoice",
      entityId: invoice.id,
      summary: `Zahlung auf ${invoice.number} erfasst`,
      at,
    });
    return invoice;
  });
}

export async function createReturn(
  db: PrismaClient,
  input: Actor & {
    salesOrderId: string;
    reason: string;
    lines: { variantId: string; quantity: number; disposition: string }[];
  },
) {
  if (!input.reason.trim()) throw new Error("Grund fehlt.");
  if (input.lines.length === 0) throw new Error("Mindestens eine Position.");
  return db.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: input.salesOrderId, organizationId: input.organizationId },
      include: { lines: true, returns: { include: { lines: true } } },
    });
    if (!order) throw new Error("Auftrag nicht gefunden.");
    const at = input.at ?? new Date();
    const number = await takeNumber(tx, input.organizationId, "return");
    const recordReturn = await tx.return.create({
      data: {
        organizationId: input.organizationId,
        number,
        salesOrderId: order.id,
        customerId: order.customerId,
        status: "requested",
        reason: input.reason.trim(),
        createdAt: at,
      },
    });
    for (const line of input.lines) {
      const source = order.lines.find((item) => item.variantId === line.variantId);
      const already = order.returns
        .filter((item) => item.status !== "rejected")
        .flatMap((item) => item.lines)
        .filter((item) => item.variantId === line.variantId)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (!source || source.shippedQty < line.quantity + already) {
        throw new Error("Retourenmenge übersteigt den Versand.");
      }
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("Menge ist ungültig.");
      await tx.returnLine.create({
        data: {
          returnId: recordReturn.id,
          variantId: line.variantId,
          quantity: line.quantity,
          disposition: line.disposition,
        },
      });
    }
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "return.requested",
      entityType: "return",
      entityId: recordReturn.id,
      summary: `${number} gemeldet`,
      at,
    });
    return recordReturn;
  });
}

export async function receiveReturn(db: PrismaClient, input: Actor & { returnId: string }) {
  return db.$transaction(async (tx) => {
    const entry = await tx.return.findFirst({
      where: { id: input.returnId, organizationId: input.organizationId },
      include: { lines: { include: { variant: true } }, salesOrder: true },
    });
    if (!entry) throw new Error("Retoure nicht gefunden.");
    if (entry.status !== "requested" && entry.status !== "approved") {
      throw new Error("Retoure ist schon abgeschlossen.");
    }
    const location = await defaultStockLocation(tx, entry.salesOrder.warehouseId);
    const at = input.at ?? new Date();
    let cost = 0;
    for (const line of entry.lines) {
      if (line.disposition === "scrap") continue;
      cost += line.quantity * line.variant.costCents;
      await writeMovement(tx, {
        organizationId: input.organizationId,
        variantId: line.variantId,
        warehouseId: entry.salesOrder.warehouseId,
        locationId: location.id,
        quantity: line.quantity,
        type: "return_in",
        referenceType: "return",
        referenceId: entry.id,
        referenceLabel: entry.number,
        reason: entry.reason,
        actorId: input.actorId,
        at,
      });
    }
    await tx.return.update({ where: { id: entry.id }, data: { status: "received" } });
    await bookReturnToStock(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      amountCents: cost,
      memo: `Retoure ${entry.number}`,
      sourceId: entry.id,
      at,
    });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "return.received",
      entityType: "return",
      entityId: entry.id,
      summary: `${entry.number} eingebucht`,
      at,
    });
    return entry;
  });
}

export async function refundReturn(db: PrismaClient, input: Actor & { returnId: string }) {
  return db.$transaction(async (tx) => {
    const entry = await tx.return.findFirst({
      where: { id: input.returnId, organizationId: input.organizationId },
      include: {
        lines: true,
        salesOrder: { include: { invoices: true, lines: true } },
      },
    });
    if (!entry) throw new Error("Retoure nicht gefunden.");
    if (!["received", "approved", "requested"].includes(entry.status)) {
      throw new Error("Retoure kann so nicht erstattet werden.");
    }
    const invoice = entry.salesOrder.invoices.find((item) => item.status === "paid");
    if (!invoice) throw new Error("Erstattung braucht eine bezahlte Rechnung. Gutschrift auf offene Posten folgt später.");
    let net = 0;
    let tax = 0;
    let gross = 0;
    for (const line of entry.lines) {
      const source = entry.salesOrder.lines.find((item) => item.variantId === line.variantId);
      if (!source) continue;
      const amount = splitGross(line.quantity * source.unitPriceCents, source.taxRateBps);
      net += amount.net;
      tax += amount.tax;
      gross += amount.gross;
    }
    const at = input.at ?? new Date();
    await postJournal(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      memo: `Erstattung ${entry.number}`,
      sourceType: "return",
      sourceId: entry.id,
      at,
      lines: [
        { code: "4000", debitCents: net },
        { code: "3800", debitCents: tax },
        { code: "1200", creditCents: gross },
      ],
    });
    await tx.return.update({ where: { id: entry.id }, data: { status: "refunded" } });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "return.refunded",
      entityType: "return",
      entityId: entry.id,
      summary: `${entry.number} erstattet`,
      at,
    });
  });
}

export async function adjustStock(
  db: PrismaClient,
  input: Actor & {
    variantId: string;
    warehouseId: string;
    locationId: string;
    quantity: number;
    reason: string;
  },
) {
  if (input.reason.trim().length < 3) throw new Error("Korrektur braucht einen Grund.");
  return db.$transaction(async (tx) => {
    const location = await tx.location.findFirst({
      where: { id: input.locationId, warehouseId: input.warehouseId },
    });
    if (!location) throw new Error("Stellplatz nicht gefunden.");
    const at = input.at ?? new Date();
    await writeMovement(tx, {
      organizationId: input.organizationId,
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      locationId: location.id,
      quantity: input.quantity,
      type: "adjustment",
      referenceType: "adjustment",
      referenceLabel: "Korrektur",
      reason: input.reason.trim(),
      actorId: input.actorId,
      at,
    });
  });
}

export async function transferStock(
  db: PrismaClient,
  input: Actor & {
    variantId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
  },
) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("Menge ist ungültig.");
  if (input.fromLocationId === input.toLocationId) throw new Error("Quell- und Zielplatz sind gleich.");
  return db.$transaction(async (tx) => {
    const from = await tx.location.findUnique({ where: { id: input.fromLocationId }, include: { warehouse: true } });
    const to = await tx.location.findUnique({ where: { id: input.toLocationId }, include: { warehouse: true } });
    if (!from || !to) throw new Error("Stellplatz nicht gefunden.");
    if (from.warehouse.organizationId !== input.organizationId || to.warehouse.organizationId !== input.organizationId) {
      throw new Error("Stellplatz gehört nicht zum Unternehmen.");
    }
    const aggregate = await tx.stockMovement.aggregate({
      where: { organizationId: input.organizationId, variantId: input.variantId, locationId: from.id },
      _sum: { quantity: true },
    });
    if ((aggregate._sum.quantity ?? 0) < input.quantity) {
      throw new Error("Am Quellplatz liegt nicht genug Bestand.");
    }
    const at = input.at ?? new Date();
    const label = `${from.warehouse.code} ${from.code} ? ${to.warehouse.code} ${to.code}`;
    await writeMovement(tx, {
      organizationId: input.organizationId,
      variantId: input.variantId,
      warehouseId: from.warehouseId,
      locationId: from.id,
      quantity: -input.quantity,
      type: "transfer_out",
      referenceType: "transfer",
      referenceLabel: label,
      actorId: input.actorId,
      at,
    });
    await writeMovement(tx, {
      organizationId: input.organizationId,
      variantId: input.variantId,
      warehouseId: to.warehouseId,
      locationId: to.id,
      quantity: input.quantity,
      type: "transfer_in",
      referenceType: "transfer",
      referenceLabel: label,
      actorId: input.actorId,
      at,
    });
  });
}
