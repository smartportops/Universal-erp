import { prisma } from "@/lib/db";
import { createReturn, receiveReturn } from "@/server/domain/commerce";
import { readJson, wmsRoute } from "@/server/wms/auth";

type Body = { orderId?: string; reason?: string; lines?: { variantId: string; quantity: number; disposition: string }[] };

/** Books a return straight away: the ERP creates it and receives the units into stock. */
export const POST = wmsRoute(async (request, ctx) => {
  const body = await readJson<Body>(request);
  if (!body.orderId) return Response.json({ error: "orderId missing" }, { status: 400 });
  const lines = (body.lines ?? [])
    .filter((l) => l.quantity > 0)
    .map((l) => ({ variantId: l.variantId, quantity: Math.floor(l.quantity), disposition: ["restock", "inspect", "scrap"].includes(l.disposition) ? l.disposition : "inspect" }));
  const entry = await createReturn(prisma, { organizationId: ctx.organizationId, actorId: ctx.actorId, salesOrderId: body.orderId, reason: body.reason ?? "WMS", lines });
  await receiveReturn(prisma, { organizationId: ctx.organizationId, actorId: ctx.actorId, returnId: entry.id });
  return Response.json({ ok: true, returnNumber: entry.number, returnId: entry.id });
});
