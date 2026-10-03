import { prisma } from "@/lib/db";
import { dayKey, todayKey } from "@/lib/format";
import { invoiceOpenAmount, signedInvoiceNet } from "@/lib/invoices";

const openOrderStatuses = ["confirmed", "picking", "partial"];

export type BalanceRow = {
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  productName: string;
  priceCents: number;
  costCents: number;
  onHand: number;
  incoming: number;
  openDemand: number;
  reorderPoint: number;
  reorderQty: number;
  supplierId: string | null;
  supplierName: string | null;
  leadTimeDays: number | null;
  warehouses: { id: string; code: string; name: string; quantity: number }[];
};

export type Problem = {
  tone: "danger" | "warning";
  kind: "negative" | "late_order" | "invoice" | "purchase" | "reorder";
  title: string;
  meta: string;
  href: string;
};

export function needsReorder(row: BalanceRow) {
  return row.reorderPoint > 0 && row.onHand + row.incoming <= row.reorderPoint;
}

/** Menge, die Meldebestand plus offene Reservierungen wieder deckt, mindestens die Bestellmenge. */
export function suggestedQty(row: BalanceRow) {
  return Math.max(row.reorderQty, row.reorderPoint + row.openDemand - row.onHand - row.incoming, 1);
}

export function isCovered(row: BalanceRow) {
  return row.reorderPoint > 0 && row.onHand <= row.reorderPoint && !needsReorder(row);
}

export async function getBalances(organizationId: string): Promise<BalanceRow[]> {
  const [variants, movements, purchaseLines, demandLines, warehouses] = await Promise.all([
    prisma.productVariant.findMany({
      where: { organizationId },
      include: { product: true, preferredSupplier: true },
      orderBy: { sku: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { organizationId },
      select: { variantId: true, warehouseId: true, quantity: true },
    }),
    prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { organizationId, status: { in: ["ordered", "partial"] } } },
      select: { variantId: true, quantity: true, receivedQty: true },
    }),
    prisma.salesOrderLine.findMany({
      where: { salesOrder: { organizationId, status: { in: openOrderStatuses } } },
      select: { variantId: true, quantity: true, shippedQty: true },
    }),
    prisma.warehouse.findMany({ where: { organizationId }, orderBy: { code: "asc" } }),
  ]);

  return variants.map((variant) => {
    const warehousesWithQty = warehouses.map((warehouse) => ({
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      quantity: movements
        .filter((movement) => movement.variantId === variant.id && movement.warehouseId === warehouse.id)
        .reduce((sum, movement) => sum + movement.quantity, 0),
    }));
    return {
      variantId: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      name: variant.name,
      productName: variant.product.name,
      priceCents: variant.priceCents,
      costCents: variant.costCents,
      onHand: warehousesWithQty.reduce((sum, warehouse) => sum + warehouse.quantity, 0),
      incoming: purchaseLines
        .filter((line) => line.variantId === variant.id)
        .reduce((sum, line) => sum + (line.quantity - line.receivedQty), 0),
      openDemand: demandLines
        .filter((line) => line.variantId === variant.id)
        .reduce((sum, line) => sum + (line.quantity - line.shippedQty), 0),
      reorderPoint: variant.reorderPoint,
      reorderQty: variant.reorderQty,
      supplierId: variant.preferredSupplierId,
      supplierName: variant.preferredSupplier?.name ?? null,
      leadTimeDays: variant.preferredSupplier?.leadTimeDays ?? null,
      warehouses: warehousesWithQty,
    };
  });
}

export async function getSnapshot(organizationId: string) {
  const today = todayKey();
  const month = today.slice(0, 7);
  const [balances, orders, purchases, invoices, activities] = await Promise.all([
    getBalances(organizationId),
    prisma.salesOrder.findMany({
      where: { organizationId },
      include: { customer: true, lines: { select: { quantity: true, unitPriceCents: true } } },
      orderBy: { orderedAt: "desc" },
    }),
    prisma.purchaseOrder.findMany({
      where: { organizationId },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { organizationId },
      include: { customer: true, payments: true },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.activity.findMany({
      where: { organizationId },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const lateOrders = orders.filter(
    (order) =>
      order.promisedAt &&
      openOrderStatuses.includes(order.status) &&
      dayKey(order.promisedAt) < today,
  );
  const overduePurchases = purchases.filter(
    (order) =>
      order.expectedAt &&
      ["ordered", "partial"].includes(order.status) &&
      dayKey(order.expectedAt) < today,
  );
  const credited = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.kind === "credit" && invoice.correctsId && !["cancelled", "void"].includes(invoice.status)) {
      credited.set(invoice.correctsId, (credited.get(invoice.correctsId) ?? 0) + invoice.totalCents);
    }
  }
  const invoiceRows = invoices.map((invoice) => {
    const paid = invoice.payments
      .filter((payment) => payment.status === "settled")
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    return { ...invoice, paid, open: invoiceOpenAmount(invoice, credited.get(invoice.id) ?? 0) };
  });
  const overdueInvoices = invoiceRows.filter(
    (invoice) =>
      invoice.dueAt &&
      ["issued", "partial"].includes(invoice.status) &&
      invoice.open > 0 &&
      dayKey(invoice.dueAt) < today,
  );
  const negative = balances.filter((row) => row.onHand < 0);
  const reorder = balances.filter(needsReorder);
  const { getLocale } = await import("@/lib/i18n-server");
  const { translate } = await import("@/lib/i18n");
  const { dictionary } = await import("@/i18n/dictionary");
  const locale = await getLocale();
  const tx = (text: string, vars?: Record<string, string | number>) => translate(locale, text, dictionary, vars);
  const problems: Problem[] = [
    ...negative.map((row) => ({
      tone: "danger" as const,
      kind: "negative" as const,
      title: tx("{sku} is below zero", { sku: row.sku }),
      meta: tx("{name} · on hand {qty}", { name: row.productName, qty: row.onHand }),
      href: `/warehouses?tab=bestand&q=${encodeURIComponent(row.sku)}`,
    })),
    ...lateOrders.map((order) => ({
      tone: "danger" as const,
      kind: "late_order" as const,
      title: tx("{number} is late", { number: order.number }),
      meta: order.customer.name,
      href: `/sales-orders/${order.id}`,
    })),
    ...overdueInvoices.map((invoice) => ({
      tone: "warning" as const,
      kind: "invoice" as const,
      title: tx("{number} is overdue", { number: invoice.number }),
      meta: invoice.customer.name,
      href: `/invoices/${invoice.id}`,
    })),
    ...overduePurchases.map((order) => ({
      tone: "warning" as const,
      kind: "purchase" as const,
      title: tx("{number} has not arrived", { number: order.number }),
      meta: order.supplier.name,
      href: `/purchase-orders/${order.id}`,
    })),
    ...reorder.slice(0, 4).map((row) => ({
      tone: "warning" as const,
      kind: "reorder" as const,
      title: tx("{sku} needs a reorder", { sku: row.sku }),
      meta: tx("On hand {onHand} · reorder point {point}", { onHand: row.onHand, point: row.reorderPoint }),
      href: `/reorder`,
    })),
  ];

  const revenueMonth = invoiceRows
    .filter((invoice) => invoice.issuedAt && dayKey(invoice.issuedAt).startsWith(month))
    .reduce((sum, invoice) => sum + signedInvoiceNet(invoice), 0);
  const stockValue = balances.reduce((sum, row) => sum + Math.max(row.onHand, 0) * row.costCents, 0);
  const unpaid = invoiceRows
    .filter((invoice) => ["issued", "partial"].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.open, 0);

  const channelMix = ["shop", "amazon", "wholesale", "ebay", "manual"].map((channel) => ({
    channel,
    count: orders.filter((order) => order.channel === channel && order.status !== "cancelled" && dayKey(order.orderedAt).startsWith(month)).length,
  }));

  return {
    balances,
    negative,
    reorder,
    lateOrders,
    overduePurchases,
    overdueInvoices,
    invoiceRows,
    problems,
    activities,
    orders,
    purchases,
    kpis: {
      openOrders: orders.filter((order) => openOrderStatuses.includes(order.status)).length,
      lateOrders: lateOrders.length,
      revenueMonth,
      stockValue,
      unpaid,
      openPurchases: purchases.filter((order) => ["ordered", "partial"].includes(order.status)).length,
    },
    channelMix,
  };
}
