import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/db";
import { splitGross } from "@/lib/format";
import { addDocument, record, takeNumber } from "@/server/domain/platform";
import { postJournal } from "@/server/domain/ledger";

type Actor = { organizationId: string; actorId: string; at?: Date };

export type VoucherInput = Actor & {
  direction: "in" | "out";
  issuedAt: Date;
  counterparty: string;
  reference: string;
  description: string;
  grossCents: number;
  taxRateBps: number;
  netAccountId: string;
  taxAccountId: string;
  contraAccountId: string;
  file?: { filename: string; mimeType: string; storageKey: string };
};

async function accountsOf(tx: Tx, organizationId: string, ids: string[]) {
  const rows = await tx.account.findMany({ where: { organizationId, id: { in: ids } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (id: string) => {
    const account = byId.get(id);
    if (!account) throw new Error("Account not found.");
    return account;
  };
}

export async function bookVoucher(db: PrismaClient, input: VoucherInput) {
  if (input.direction !== "in" && input.direction !== "out") throw new Error("Direction is missing.");
  const counterparty = input.counterparty.trim();
  if (!counterparty) throw new Error("Counterparty is missing.");
  if (!Number.isInteger(input.grossCents) || input.grossCents <= 0) throw new Error("Amount is missing.");
  if (!Number.isInteger(input.taxRateBps) || input.taxRateBps < 0) throw new Error("Tax rate is missing.");
  if (input.netAccountId === input.contraAccountId) throw new Error("The posting account and the contra account must differ.");
  const parts = splitGross(input.grossCents, input.taxRateBps);
  if (parts.tax > 0 && !input.taxAccountId) throw new Error("Pick a tax account.");
  return db.$transaction(async (tx) => {
    const account = await accountsOf(tx, input.organizationId, [input.netAccountId, input.taxAccountId, input.contraAccountId].filter(Boolean));
    const net = account(input.netAccountId);
    const contra = account(input.contraAccountId);
    const tax = parts.tax > 0 ? account(input.taxAccountId) : null;
    const number = await takeNumber(tx, input.organizationId, "voucher");
    const at = input.issuedAt;
    const voucher = await tx.voucher.create({
      data: {
        organizationId: input.organizationId,
        number,
        direction: input.direction,
        status: "booked",
        issuedAt: at,
        counterparty,
        reference: input.reference.trim(),
        description: input.description.trim(),
        netCents: parts.net,
        taxCents: parts.tax,
        totalCents: parts.gross,
        taxRateBps: input.taxRateBps,
        netAccountId: net.id,
        taxAccountId: tax?.id ?? null,
        contraAccountId: contra.id,
        filename: input.file?.filename ?? "",
        mimeType: input.file?.mimeType ?? "",
        storageKey: input.file?.storageKey ?? "",
        createdAt: new Date(),
      },
    });
    const lines =
      input.direction === "in"
        ? [
            { code: net.code, debitCents: parts.net },
            ...(tax ? [{ code: tax.code, debitCents: parts.tax }] : []),
            { code: contra.code, creditCents: parts.gross },
          ]
        : [
            { code: contra.code, debitCents: parts.gross },
            { code: net.code, creditCents: parts.net },
            ...(tax ? [{ code: tax.code, creditCents: parts.tax }] : []),
          ];
    const entry = await postJournal(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      memo: `${number} · ${counterparty}`,
      sourceType: "voucher",
      sourceId: voucher.id,
      at,
      lines,
    });
    if (entry) await tx.voucher.update({ where: { id: voucher.id }, data: { journalEntryId: entry.id } });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "voucher.booked",
      entityType: "voucher",
      entityId: voucher.id,
      summary: `${number} booked`,
      at,
    });
    await addDocument(tx, {
      organizationId: input.organizationId,
      title: `${number} · ${counterparty}`,
      kind: input.direction === "in" ? "incoming" : "outgoing",
      entityType: "voucher",
      entityId: voucher.id,
      filename: input.file?.filename || `${number}.pdf`,
      at,
    });
    return voucher;
  });
}

export async function voidVoucher(db: PrismaClient, input: Actor & { voucherId: string }) {
  return db.$transaction(async (tx) => {
    const voucher = await tx.voucher.findFirst({ where: { id: input.voucherId, organizationId: input.organizationId } });
    if (!voucher) throw new Error("Voucher not found.");
    if (voucher.status === "void") throw new Error("This voucher is already void.");
    const entry = await tx.journalEntry.findFirst({
      where: { organizationId: input.organizationId, sourceType: "voucher", sourceId: voucher.id },
      include: { lines: { include: { account: true } } },
    });
    if (!entry) throw new Error("This voucher has no posting.");
    const at = input.at ?? new Date();
    await postJournal(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      memo: `Reversal ${voucher.number}`,
      sourceType: "voucher_void",
      sourceId: voucher.id,
      at,
      lines: entry.lines.map((line) => ({
        code: line.account.code,
        debitCents: line.creditCents,
        creditCents: line.debitCents,
      })),
    });
    await tx.voucher.update({ where: { id: voucher.id }, data: { status: "void" } });
    await record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: "voucher.voided",
      entityType: "voucher",
      entityId: voucher.id,
      summary: `${voucher.number} voided`,
      at,
    });
    return voucher;
  });
}

function signOf(kind: string) {
  return kind === "cancellation" || kind === "credit" ? -1 : 1;
}

export type DocumentRow = {
  origin: "upload" | "system";
  id: string;
  date: Date | null;
  number: string;
  direction: "in" | "out";
  party: string;
  reference: string;
  net: number;
  tax: number;
  gross: number;
  status: string;
  kind: string;
};

/** Every uploaded voucher plus every document this system issued. */
export async function listDocuments(organizationId: string): Promise<DocumentRow[]> {
  const [vouchers, invoices] = await Promise.all([
    prisma.voucher.findMany({ where: { organizationId } }),
    prisma.invoice.findMany({
      where: { organizationId, status: { not: "void" } },
      include: { customer: true, salesOrder: { select: { number: true } } },
    }),
  ]);
  const rows: DocumentRow[] = [
    ...vouchers.map((voucher) => ({
      origin: "upload" as const,
      id: voucher.id,
      date: voucher.issuedAt,
      number: voucher.number,
      direction: voucher.direction === "in" ? "in" as const : "out" as const,
      party: voucher.counterparty,
      reference: voucher.reference,
      net: voucher.netCents,
      tax: voucher.taxCents,
      gross: voucher.totalCents,
      status: voucher.status,
      kind: voucher.direction,
    })),
    ...invoices.map((invoice) => {
      const sign = signOf(invoice.kind);
      return {
        origin: "system" as const,
        id: invoice.id,
        date: invoice.issuedAt,
        number: invoice.number,
        direction: "out" as const,
        party: invoice.customer.name,
        reference: invoice.salesOrder?.number ?? "",
        net: sign * invoice.netCents,
        tax: sign * invoice.taxCents,
        gross: sign * invoice.totalCents,
        status: invoice.status,
        kind: invoice.kind,
      };
    }),
  ];
  return rows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0) || b.number.localeCompare(a.number));
}

export function matchesDocument(row: DocumentRow, query: { q?: string; direction?: string }) {
  if (query.direction === "system" && row.origin !== "system") return false;
  if (query.direction === "in" && !(row.origin === "upload" && row.direction === "in")) return false;
  if (query.direction === "out" && !(row.origin === "upload" && row.direction === "out")) return false;
  const needle = (query.q ?? "").trim().toLowerCase();
  if (!needle) return true;
  return [row.number, row.party, row.reference].some((value) => value.toLowerCase().includes(needle));
}
