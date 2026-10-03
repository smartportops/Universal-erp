import { unstable_rethrow } from "next/navigation";
import type { Tx } from "@/lib/db";
import { queueWebhooks, takeNumber } from "@/server/domain/platform";
import { dictionary } from "@/i18n/dictionary";
import { translate, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

async function readLocale(): Promise<Locale> {
  try {
    return await getLocale();
  } catch (error) {
    unstable_rethrow(error);
    return "en";
  }
}

type MovementInput = {
  organizationId: string;
  variantId: string;
  warehouseId: string;
  locationId: string;
  quantity: number;
  type: string;
  referenceType?: string;
  referenceId?: string;
  referenceLabel?: string;
  reason?: string;
  actorId?: string | null;
  at?: Date;
};

export async function writeMovement(tx: Tx, input: MovementInput) {
  if (!Number.isInteger(input.quantity) || input.quantity === 0) {
    throw new Error("Bewegungsmenge muss eine ganze Zahl ungleich null sein.");
  }
  const at = input.at ?? new Date();
  const variant = await tx.productVariant.findFirst({
    where: { id: input.variantId, organizationId: input.organizationId },
    include: { product: true },
  });
  if (!variant) throw new Error("Artikel nicht gefunden.");

  const movement = await tx.stockMovement.create({
    data: {
      organizationId: input.organizationId,
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      locationId: input.locationId,
      quantity: input.quantity,
      type: input.type,
      referenceType: input.referenceType ?? "",
      referenceId: input.referenceId ?? "",
      referenceLabel: input.referenceLabel ?? "",
      reason: input.reason ?? "",
      actorId: input.actorId ?? null,
      createdAt: at,
    },
  });

  const aggregate = await tx.stockMovement.aggregate({
    where: { organizationId: input.organizationId, variantId: input.variantId },
    _sum: { quantity: true },
  });
  const balance = aggregate._sum.quantity ?? 0;
  const summary = `${input.quantity > 0 ? "+" : ""}${input.quantity} ${variant.sku}${input.referenceLabel ? ` · ${input.referenceLabel}` : ""}`;

  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      action: "stock.movement_posted",
      entityType: "stock_movement",
      entityId: movement.id,
      summary,
      metadata: JSON.stringify({ balance, type: input.type, sku: variant.sku }),
      createdAt: at,
    },
  });
  await tx.activity.create({
    data: {
      organizationId: input.organizationId,
      entityType: "product_variant",
      entityId: variant.id,
      kind: "system",
      title: summary,
      body: input.reason ?? "",
      actorId: input.actorId ?? null,
      createdAt: at,
    },
  });
  const event = await tx.domainEvent.create({
    data: {
      organizationId: input.organizationId,
      type: "stock.movement_posted",
      entityType: "stock_movement",
      entityId: movement.id,
      payload: JSON.stringify({ sku: variant.sku, quantity: input.quantity, balance }),
      createdAt: at,
    },
  });
  await queueWebhooks(tx, event.id, input.organizationId, "stock.movement_posted", at);

  if (balance < 0) {
    const negative = await tx.domainEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "stock.negative",
        entityType: "product_variant",
        entityId: variant.id,
        payload: JSON.stringify({ sku: variant.sku, balance }),
        createdAt: at,
      },
    });
    await queueWebhooks(tx, negative.id, input.organizationId, "stock.negative", at);
    const locale = await readLocale();
    const note = (text: string, vars?: Record<string, string | number>) => translate(locale, text, dictionary, vars);
    await tx.notification.create({
      data: {
        organizationId: input.organizationId,
        kind: "attention",
        title: note("Negative stock {sku}", { sku: variant.sku }),
        body: note("{name} is at {balance}.", { name: variant.product.name, balance }),
        href: `/warehouses?tab=bestand&q=${encodeURIComponent(variant.sku)}`,
        createdAt: at,
      },
    });
  }

  return { movement, balance, variant };
}

async function accountId(tx: Tx, organizationId: string, code: string) {
  const account = await tx.account.findFirst({ where: { organizationId, code } });
  if (!account) throw new Error(`Konto ${code} fehlt.`);
  return account.id;
}

export async function postJournal(
  tx: Tx,
  input: {
    organizationId: string;
    actorId?: string | null;
    memo: string;
    sourceType?: string;
    sourceId?: string;
    at?: Date;
    lines: { code: string; debitCents?: number; creditCents?: number; description?: string }[];
  },
) {
  const lines = input.lines.filter((line) => (line.debitCents ?? 0) > 0 || (line.creditCents ?? 0) > 0);
  const debit = lines.reduce((sum, line) => sum + (line.debitCents ?? 0), 0);
  const credit = lines.reduce((sum, line) => sum + (line.creditCents ?? 0), 0);
  if (debit !== credit) {
    throw new Error(`Buchung ist nicht ausgeglichen (${debit} / ${credit}).`);
  }
  if (debit === 0) return null;
  for (const line of lines) {
    const left = line.debitCents ?? 0;
    const right = line.creditCents ?? 0;
    if (left < 0 || right < 0 || (left > 0 && right > 0)) {
      throw new Error("Buchungszeile ist ungueltig.");
    }
  }
  const at = input.at ?? new Date();
  const number = await takeNumber(tx, input.organizationId, "journal");
  const entry = await tx.journalEntry.create({
    data: {
      organizationId: input.organizationId,
      number,
      entryDate: at,
      memo: input.memo,
      sourceType: input.sourceType ?? "",
      sourceId: input.sourceId ?? "",
      createdAt: at,
    },
  });
  for (const line of lines) {
    await tx.journalLine.create({
      data: {
        entryId: entry.id,
        accountId: await accountId(tx, input.organizationId, line.code),
        debitCents: line.debitCents ?? 0,
        creditCents: line.creditCents ?? 0,
        description: line.description ?? input.memo,
      },
    });
  }
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      action: "journal.posted",
      entityType: "journal_entry",
      entityId: entry.id,
      summary: `${number} ${input.memo}`,
      createdAt: at,
    },
  });
  return entry;
}

export async function bookInventoryReceipt(
  tx: Tx,
  input: { organizationId: string; actorId?: string | null; amountCents: number; memo: string; sourceId: string; at?: Date },
) {
  return postJournal(tx, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    memo: input.memo,
    sourceType: "purchase_order",
    sourceId: input.sourceId,
    at: input.at,
    lines: [
      { code: "1600", debitCents: input.amountCents },
      { code: "3300", creditCents: input.amountCents },
    ],
  });
}

export async function bookCogs(
  tx: Tx,
  input: { organizationId: string; actorId?: string | null; amountCents: number; memo: string; sourceId: string; at?: Date },
) {
  return postJournal(tx, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    memo: input.memo,
    sourceType: "shipment",
    sourceId: input.sourceId,
    at: input.at,
    lines: [
      { code: "5000", debitCents: input.amountCents },
      { code: "1600", creditCents: input.amountCents },
    ],
  });
}

export async function bookReturnToStock(
  tx: Tx,
  input: { organizationId: string; actorId?: string | null; amountCents: number; memo: string; sourceId: string; at?: Date },
) {
  return postJournal(tx, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    memo: input.memo,
    sourceType: "return",
    sourceId: input.sourceId,
    at: input.at,
    lines: [
      { code: "1600", debitCents: input.amountCents },
      { code: "5000", creditCents: input.amountCents },
    ],
  });
}
