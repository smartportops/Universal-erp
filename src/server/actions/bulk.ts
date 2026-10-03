"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { translator } from "@/lib/i18n-server";
import { messageFor, refresh } from "@/server/action";
import { cancelSalesOrder, issueInvoice, markPurchaseOrdered } from "@/server/domain/commerce";
import { completeSalesOrder, createCancellation, setOrderHold } from "@/server/domain/documents";
import { record } from "@/server/domain/platform";

export type BulkEntity = "sales_order" | "product" | "customer" | "purchase_order" | "invoice";

type Ctx = { organizationId: string; actorId: string };
type Handler = { permission: Permission; run: (ctx: Ctx, id: string) => Promise<void> };

const handlers: Record<BulkEntity, Record<string, Handler>> = {
  sales_order: {
    cancel: { permission: "sales.write", run: (ctx, id) => cancelSalesOrder(prisma, { ...ctx, salesOrderId: id }).then(() => undefined) },
    invoice: { permission: "finance.write", run: (ctx, id) => issueInvoice(prisma, { ...ctx, salesOrderId: id }).then(() => undefined) },
    hold: { permission: "sales.write", run: (ctx, id) => setOrderHold(prisma, { ...ctx, salesOrderId: id, onHold: true }).then(() => undefined) },
    release: { permission: "sales.write", run: (ctx, id) => setOrderHold(prisma, { ...ctx, salesOrderId: id, onHold: false }).then(() => undefined) },
    complete: { permission: "sales.write", run: (ctx, id) => completeSalesOrder(prisma, { ...ctx, salesOrderId: id }).then(() => undefined) },
  },
  product: {
    activate: { permission: "catalog.write", run: (ctx, id) => setProductStatus(ctx, id, "active") },
    draft: { permission: "catalog.write", run: (ctx, id) => setProductStatus(ctx, id, "draft") },
    archive: { permission: "catalog.write", run: (ctx, id) => setProductStatus(ctx, id, "archived") },
  },
  customer: {
    b2b: { permission: "sales.write", run: (ctx, id) => setCustomerType(ctx, id, "b2b") },
    b2c: { permission: "sales.write", run: (ctx, id) => setCustomerType(ctx, id, "b2c") },
  },
  purchase_order: {
    order: { permission: "purchasing.write", run: (ctx, id) => markPurchaseOrdered(prisma, { ...ctx, purchaseOrderId: id }).then(() => undefined) },
    cancel: { permission: "purchasing.write", run: cancelPurchase },
  },
  invoice: {
    cancel: { permission: "finance.write", run: (ctx, id) => createCancellation(prisma, { ...ctx, invoiceId: id }).then(() => undefined) },
  },
};

async function setProductStatus(ctx: Ctx, id: string, status: string) {
  const result = await prisma.product.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { status } });
  if (result.count === 0) throw new Error("Product not found.");
}

async function setCustomerType(ctx: Ctx, id: string, type: string) {
  const result = await prisma.customer.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { type } });
  if (result.count === 0) throw new Error("Customer not found.");
}

async function cancelPurchase(ctx: Ctx, id: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!order) throw new Error("Purchase order not found.");
    if (!["draft", "ordered"].includes(order.status)) throw new Error("Only drafts and ordered purchase orders can be cancelled.");
    await tx.purchaseOrder.update({ where: { id }, data: { status: "cancelled" } });
    await record(tx, {
      organizationId: ctx.organizationId,
      actorId: ctx.actorId,
      type: "purchase_order.cancelled",
      entityType: "PurchaseOrder",
      entityId: id,
      summary: `Bestellung ${order.number} storniert`,
      metadata: { number: order.number },
    });
  });
}

export async function runBulk(input: { entity: BulkEntity; action: string; ids: string[]; returnTo: string }) {
  const handler = handlers[input.entity]?.[input.action];
  if (!handler) throw new Error("Unknown action.");
  const session = await requirePermission(handler.permission);
  const ctx = { organizationId: session.organization.id, actorId: session.user.id };
  const ids = [...new Set(input.ids.map(String).filter(Boolean))].slice(0, 2000);
  let done = 0;
  const failures: string[] = [];
  for (const id of ids) {
    try {
      await handler.run(ctx, id);
      done += 1;
    } catch (error) {
      failures.push(messageFor(error));
    }
  }
  refresh();
  const base = input.returnTo.startsWith("/") ? input.returnTo.split("?")[0] : "/";
  const params = new URLSearchParams(input.returnTo.includes("?") ? input.returnTo.split("?")[1] : "");
  params.delete("notice");
  params.delete("error");
  const tx = await translator();
  if (failures.length === 0) {
    params.set("notice", tx("{n} done.", { n: done }));
  } else {
    const reasons = [...new Set(failures)].slice(0, 2).map((reason) => tx(reason)).join(" ");
    params.set(done ? "notice" : "error", `${tx("{done} done, {skipped} skipped.", { done, skipped: failures.length })} ${reasons}`.trim());
  }
  redirect(`${base}?${params.toString()}`);
}
