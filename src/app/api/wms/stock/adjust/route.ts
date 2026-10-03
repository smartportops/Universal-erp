import { prisma } from "@/lib/db";
import { adjustStock } from "@/server/domain/commerce";
import { readJson, wmsRoute } from "@/server/wms/auth";

type Body = { variantId?: string; binId?: string; quantity?: number; reason?: string };

export const POST = wmsRoute(async (request, ctx) => {
  const body = await readJson<Body>(request);
  if (!body.variantId || !body.binId) return Response.json({ error: "variantId and binId are required" }, { status: 400 });
  const location = await prisma.location.findFirst({ where: { id: body.binId, warehouse: { organizationId: ctx.organizationId } } });
  if (!location) return Response.json({ error: "bin not found" }, { status: 404 });
  await adjustStock(prisma, { organizationId: ctx.organizationId, actorId: ctx.actorId, variantId: body.variantId, warehouseId: location.warehouseId, locationId: location.id, quantity: Math.trunc(body.quantity ?? 0), reason: body.reason ?? "WMS" });
  return Response.json({ ok: true });
});
