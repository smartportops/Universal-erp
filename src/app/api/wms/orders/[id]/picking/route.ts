import { prisma } from "@/lib/db";
import { markPicking } from "@/server/domain/commerce";
import { wmsRoute } from "@/server/wms/auth";

/** Marks an order as "picking" when it lands on a pick list. Idempotent. */
export const POST = wmsRoute<{ id: string }>(async (_request, ctx, params) => {
  const order = await prisma.salesOrder.findFirst({ where: { id: params.id, organizationId: ctx.organizationId } });
  if (!order) return Response.json({ error: "order not found" }, { status: 404 });
  if (order.status === "confirmed") await markPicking(prisma, { organizationId: ctx.organizationId, actorId: ctx.actorId, salesOrderId: order.id });
  return Response.json({ ok: true });
});
