"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { refresh, runAction } from "@/server/action";
import { readDate, readLines } from "@/server/forms";
import {
  cancelSalesOrder,
  createReturn,
  createSalesOrder,
  markDelivered,
  markPicking,
  receiveReturn,
  refundReturn,
  shipSalesOrder,
} from "@/server/domain/commerce";

export async function createOrder(formData: FormData) {
  await runAction("/sales-orders/new", async () => {
    const session = await requirePermission("sales.write");
    const lines = readLines(formData).map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
      unitPriceCents: line.unitAmount ?? undefined,
    }));
    const order = await createSalesOrder(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      customerId: String(formData.get("customerId") || ""),
      warehouseId: String(formData.get("warehouseId") || ""),
      channel: String(formData.get("channel") || "manual"),
      promisedAt: readDate(formData, "promisedAt"),
      externalRef: String(formData.get("externalRef") || ""),
      notes: String(formData.get("notes") || ""),
      lines,
    });
    refresh();
    redirect(`/sales-orders/${order.id}?notice=` + encodeURIComponent("Order created."))
  });
}

export async function pickOrder(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/sales-orders/${id}`, async () => {
    const session = await requirePermission("fulfillment.write");
    await markPicking(prisma, { organizationId: session.organization.id, actorId: session.user.id, salesOrderId: id });
    refresh();
    redirect(`/sales-orders/${id}?notice=` + encodeURIComponent("In picking."));
  });
}

export async function cancelOrder(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/sales-orders/${id}`, async () => {
    const session = await requirePermission("sales.write");
    await cancelSalesOrder(prisma, { organizationId: session.organization.id, actorId: session.user.id, salesOrderId: id });
    refresh();
    redirect(`/sales-orders/${id}?notice=` + encodeURIComponent("Cancelled."));
  });
}

export async function shipOrder(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/sales-orders/${id}`, async () => {
    const session = await requirePermission("fulfillment.write");
    const shipment = await shipSalesOrder(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      salesOrderId: id,
      carrier: String(formData.get("carrier") || ""),
      trackingNumber: String(formData.get("trackingNumber") || ""),
    });
    refresh();
    redirect(`/shipments/${shipment.id}?notice=` + encodeURIComponent("Shipment created."));
  });
}

export async function deliverOrder(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/sales-orders/${id}`, async () => {
    const session = await requirePermission("fulfillment.write");
    await markDelivered(prisma, { organizationId: session.organization.id, actorId: session.user.id, salesOrderId: id });
    refresh();
    redirect(`/sales-orders/${id}?notice=` + encodeURIComponent("Delivered."));
  });
}

export async function openReturn(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/sales-orders/${id}`, async () => {
    const session = await requirePermission("fulfillment.write");
    const order = await prisma.salesOrder.findFirst({
      where: { id, organizationId: session.organization.id },
      include: { lines: true },
    });
    if (!order) throw new Error("Order not found.");
    const lines = order.lines
      .filter((line) => line.shippedQty > 0)
      .map((line) => ({
        variantId: line.variantId,
        quantity: line.shippedQty,
        disposition: String(formData.get("disposition") || "restock"),
      }));
    const entry = await createReturn(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      salesOrderId: id,
      reason: String(formData.get("reason") || ""),
      lines,
    });
    refresh();
    redirect(`/returns/${entry.id}`);
  });
}

export async function receiveReturnAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/returns/${id}`, async () => {
    const session = await requirePermission("stock.write");
    await receiveReturn(prisma, { organizationId: session.organization.id, actorId: session.user.id, returnId: id });
    refresh();
    redirect(`/returns/${id}?notice=` + encodeURIComponent("Return posted."));
  });
}

export async function refundReturnAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/returns/${id}`, async () => {
    const session = await requirePermission("finance.write");
    await refundReturn(prisma, { organizationId: session.organization.id, actorId: session.user.id, returnId: id });
    refresh();
    redirect(`/returns/${id}?notice=` + encodeURIComponent("Refund posted."));
  });
}
