import { prisma } from "@/lib/db";
import { transferStock } from "@/server/domain/commerce";
import { readJson, wmsRoute } from "@/server/wms/auth";

type Body = { variantId?: string; fromBinId?: string; toBinId?: string; quantity?: number };

export const POST = wmsRoute(async (request, ctx) => {
  const body = await readJson<Body>(request);
  if (!body.variantId || !body.fromBinId || !body.toBinId) return Response.json({ error: "variantId, fromBinId and toBinId are required" }, { status: 400 });
  await transferStock(prisma, { organizationId: ctx.organizationId, actorId: ctx.actorId, variantId: body.variantId, fromLocationId: body.fromBinId, toLocationId: body.toBinId, quantity: Math.floor(body.quantity ?? 0) });
  return Response.json({ ok: true });
});
