import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  WmsArticle,
  WmsBin,
  WmsBinStock,
  WmsDashboard,
  WmsHandshake,
  WmsMovement,
  WmsOrder,
  WmsPickProfile,
  WmsPurchaseOrder,
} from "../../../wms/src/shared/api";
import type { WmsContext } from "./auth";

const openOrderStatuses = ["confirmed", "picking", "partial"];
const shippedOrderStatuses = ["shipped", "delivered", "partial"];

/** Stock per bin for a set of variants inside one warehouse. */
async function binStock(ctx: WmsContext, variantIds: string[]): Promise<Map<string, WmsBinStock[]>> {
  const result = new Map<string, WmsBinStock[]>();
  if (variantIds.length === 0) return result;
  const grouped = await prisma.stockMovement.groupBy({
    by: ["variantId", "locationId"],
    where: { organizationId: ctx.organizationId, warehouseId: ctx.warehouseId, variantId: { in: variantIds } },
    _sum: { quantity: true },
  });
  const locationIds = [...new Set(grouped.map((g) => g.locationId))];
  const locations = await prisma.location.findMany({ where: { id: { in: locationIds } } });
  const codes = new Map(locations.map((l) => [l.id, l.code]));
  for (const row of grouped) {
    const quantity = row._sum.quantity ?? 0;
    if (quantity <= 0) continue;
    const list = result.get(row.variantId) ?? [];
    list.push({ binId: row.locationId, binCode: codes.get(row.locationId) ?? "?", quantity });
    result.set(row.variantId, list);
  }
  for (const list of result.values()) list.sort((a, b) => a.binCode.localeCompare(b.binCode));
  return result;
}

export async function handshake(ctx: WmsContext): Promise<WmsHandshake> {
  const [org, warehouses] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }),
    prisma.warehouse.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] }),
  ]);
  return {
    organization: { id: org.id, name: org.name },
    warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, isDefault: w.isDefault })),
    serverTime: new Date().toISOString(),
    apiVersion: 1,
  };
}

export async function dashboard(ctx: WmsContext): Promise<WmsDashboard> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 6);
  const [openPurchaseOrders, openOrders, onHoldOrders, movements, returns7d, variants] = await Promise.all([
    prisma.purchaseOrder.count({ where: { organizationId: ctx.organizationId, warehouseId: ctx.warehouseId, status: { in: ["ordered", "partial"] } } }),
    prisma.salesOrder.count({ where: { organizationId: ctx.organizationId, warehouseId: ctx.warehouseId, status: { in: openOrderStatuses }, onHold: false } }),
    prisma.salesOrder.count({ where: { organizationId: ctx.organizationId, warehouseId: ctx.warehouseId, onHold: true, status: { in: openOrderStatuses } } }),
    prisma.stockMovement.findMany({
      where: { organizationId: ctx.organizationId, warehouseId: ctx.warehouseId, createdAt: { gte: since }, type: { in: ["receipt", "shipment"] } },
      select: { createdAt: true, type: true, quantity: true },
    }),
    prisma.return.count({ where: { organizationId: ctx.organizationId, createdAt: { gte: since } } }),
    prisma.productVariant.findMany({ where: { organizationId: ctx.organizationId, reorderPoint: { gt: 0 }, status: "active" }, select: { id: true, reorderPoint: true } }),
  ]);
  const days: WmsDashboard["days"] = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const rows = movements.filter((m) => m.createdAt.toISOString().slice(0, 10) === key);
    days.push({
      date: key,
      shipped: rows.filter((m) => m.type === "shipment").reduce((acc, m) => acc - m.quantity, 0),
      received: rows.filter((m) => m.type === "receipt").reduce((acc, m) => acc + m.quantity, 0),
    });
  }
  let lowStock = 0;
  if (variants.length) {
    const sums = await prisma.stockMovement.groupBy({
      by: ["variantId"],
      where: { organizationId: ctx.organizationId, variantId: { in: variants.map((v) => v.id) } },
      _sum: { quantity: true },
    });
    const onHand = new Map(sums.map((s) => [s.variantId, s._sum.quantity ?? 0]));
    lowStock = variants.filter((v) => (onHand.get(v.id) ?? 0) <= v.reorderPoint).length;
  }
  return {
    openPurchaseOrders,
    openOrders,
    onHoldOrders,
    shipped7d: days.reduce((acc, d) => acc + d.shipped, 0),
    received7d: days.reduce((acc, d) => acc + d.received, 0),
    returns7d,
    lowStock,
    days,
  };
}

export async function purchaseOrders(ctx: WmsContext): Promise<WmsPurchaseOrder[]> {
  const orders = await prisma.purchaseOrder.findMany({
    where: { organizationId: ctx.organizationId, warehouseId: ctx.warehouseId, status: { in: ["ordered", "partial"] } },
    include: { supplier: true, lines: { include: { variant: true } } },
    orderBy: [{ expectedAt: "asc" }, { createdAt: "asc" }],
  });
  return orders.map((po) => ({
    id: po.id,
    number: po.number,
    status: po.status,
    supplier: { id: po.supplier.id, name: po.supplier.name },
    warehouseId: po.warehouseId,
    orderedAt: (po.orderedAt ?? po.createdAt).toISOString(),
    expectedAt: po.expectedAt?.toISOString() ?? null,
    reference: po.notes.slice(0, 60),
    lines: po.lines.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      sku: line.variant.sku,
      ean: line.variant.ean,
      name: line.variant.name,
      ordered: line.quantity,
      received: line.receivedQty,
    })),
  }));
}

export type OrderQuery = { status?: string; q?: string; number?: string; customer?: string; tracking?: string };

export async function orders(ctx: WmsContext, query: OrderQuery): Promise<WmsOrder[]> {
  const where: Prisma.SalesOrderWhereInput = { organizationId: ctx.organizationId, warehouseId: ctx.warehouseId };
  if (query.status === "shipped") where.status = { in: shippedOrderStatuses };
  else if (query.status === "open" || !query.status) where.status = { in: openOrderStatuses };
  if (query.number) where.number = { contains: query.number, mode: "insensitive" };
  if (query.customer) where.customer = { OR: [{ name: { contains: query.customer, mode: "insensitive" } }, { company: { contains: query.customer, mode: "insensitive" } }] };
  if (query.tracking) where.shipments = { some: { OR: [{ trackingNumber: { contains: query.tracking } }, { number: { contains: query.tracking, mode: "insensitive" } }] } };
  if (query.q) {
    where.OR = [
      { number: { contains: query.q, mode: "insensitive" } },
      { externalRef: { contains: query.q, mode: "insensitive" } },
      { customer: { name: { contains: query.q, mode: "insensitive" } } },
      { customer: { company: { contains: query.q, mode: "insensitive" } } },
      { shipments: { some: { trackingNumber: { contains: query.q } } } },
      { lines: { some: { variant: { OR: [{ sku: { contains: query.q, mode: "insensitive" } }, { ean: query.q }] } } } },
    ];
  }
  const rows = await prisma.salesOrder.findMany({
    where,
    include: { customer: true, lines: { include: { variant: true } }, shipments: { orderBy: { createdAt: "desc" } } },
    orderBy: query.status === "shipped" ? { orderedAt: "desc" } : [{ priority: "asc" }, { orderedAt: "asc" }],
    take: 200,
  });
  const stock = await binStock(ctx, [...new Set(rows.flatMap((o) => o.lines.map((l) => l.variantId)))]);
  return rows.map((order) => ({
    id: order.id,
    number: order.number,
    channel: order.channel,
    status: order.status,
    priority: order.priority,
    onHold: order.onHold,
    placedAt: order.orderedAt.toISOString(),
    warehouseId: order.warehouseId,
    customer: { id: order.customer.id, name: order.customer.name, company: order.customer.company, type: order.customer.type },
    shipTo: { city: order.customer.city, country: order.customer.country },
    lines: order.lines.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      sku: line.variant.sku,
      ean: line.variant.ean,
      name: line.variant.name,
      quantity: line.quantity,
      shipped: line.shippedQty,
      bins: stock.get(line.variantId) ?? [],
    })),
    shipments: order.shipments.map((s) => ({ id: s.id, number: s.number, carrier: s.carrier, trackingNumber: s.trackingNumber, shippedAt: s.shippedAt?.toISOString() ?? null })),
  }));
}

export async function pickProfiles(ctx: WmsContext): Promise<WmsPickProfile[]> {
  const rows = await prisma.pickProfile.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    channel: p.channel || null,
    customerType: p.customerType || null,
    maxOrders: p.maxOrders,
    carrier: p.carrier,
    maxLines: p.maxLines,
  }));
}

export async function articles(ctx: WmsContext, q: string): Promise<WmsArticle[]> {
  const needle = q.trim();
  const variants = await prisma.productVariant.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: { not: "archived" },
      ...(needle
        ? { OR: [{ sku: { contains: needle, mode: "insensitive" } }, { ean: { contains: needle } }, { name: { contains: needle, mode: "insensitive" } }, { product: { name: { contains: needle, mode: "insensitive" } } }] }
        : {}),
    },
    include: { product: true },
    orderBy: { sku: "asc" },
    take: 300,
  });
  const ids = variants.map((v) => v.id);
  const [stock, incoming, demand] = await Promise.all([
    binStock(ctx, ids),
    prisma.purchaseOrderLine.findMany({ where: { variantId: { in: ids }, purchaseOrder: { status: { in: ["ordered", "partial"] }, warehouseId: ctx.warehouseId } }, select: { variantId: true, quantity: true, receivedQty: true } }),
    prisma.salesOrderLine.findMany({ where: { variantId: { in: ids }, salesOrder: { status: { in: openOrderStatuses }, warehouseId: ctx.warehouseId } }, select: { variantId: true, quantity: true, shippedQty: true } }),
  ]);
  return variants.map((v) => {
    const bins = stock.get(v.id) ?? [];
    return {
      variantId: v.id,
      productId: v.productId,
      sku: v.sku,
      ean: v.ean,
      name: v.name,
      productName: v.product.name,
      onHand: bins.reduce((acc, b) => acc + b.quantity, 0),
      incoming: incoming.filter((l) => l.variantId === v.id).reduce((acc, l) => acc + (l.quantity - l.receivedQty), 0),
      openDemand: demand.filter((l) => l.variantId === v.id).reduce((acc, l) => acc + (l.quantity - l.shippedQty), 0),
      bins,
    };
  });
}

export async function bins(ctx: WmsContext): Promise<WmsBin[]> {
  const [locations, grouped] = await Promise.all([
    prisma.location.findMany({ where: { warehouseId: ctx.warehouseId }, orderBy: { code: "asc" } }),
    prisma.stockMovement.groupBy({ by: ["locationId", "variantId"], where: { organizationId: ctx.organizationId, warehouseId: ctx.warehouseId }, _sum: { quantity: true } }),
  ]);
  return locations.map((l) => {
    const rows = grouped.filter((g) => g.locationId === l.id && (g._sum.quantity ?? 0) > 0);
    return { id: l.id, warehouseId: l.warehouseId, code: l.code, name: l.name, type: l.type, active: l.active, articles: rows.length, units: rows.reduce((acc, r) => acc + (r._sum.quantity ?? 0), 0) };
  });
}

export async function movements(ctx: WmsContext, limit: number): Promise<WmsMovement[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { organizationId: ctx.organizationId, warehouseId: ctx.warehouseId },
    include: { variant: true, location: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map((m) => ({ id: m.id, at: m.createdAt.toISOString(), sku: m.variant.sku, name: m.variant.name, binCode: m.location.code, quantity: m.quantity, type: m.type, reference: m.referenceLabel }));
}
