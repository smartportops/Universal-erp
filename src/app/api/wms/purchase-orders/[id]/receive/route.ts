import { prisma } from "@/lib/db";
import { receivePurchaseOrder } from "@/server/domain/commerce";
import { readJson, wmsRoute } from "@/server/wms/auth";

type Body = { quantities?: Record<string, number> };

/** Books a goods receipt (full or partial) for a purchase order. */
export const POST = wmsRoute<{ id: string }>(async (request, ctx, params) => {
  const body = await readJson<Body>(request);
  const quantities = body.quantities && Object.keys(body.quantities).length ? body.quantities : undefined;
  const order = await receivePurchaseOrder(prisma, { organizationId: ctx.organizationId, actorId: ctx.actorId, purchaseOrderId: params.id, quantities });
  return Response.json({ ok: true, number: order.number });
});
