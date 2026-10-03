import { prisma } from "@/lib/db";
import { readJson, wmsRoute } from "@/server/wms/auth";
import { bins } from "@/server/wms/data";

type Body = { code?: string; name?: string; type?: string };

export const GET = wmsRoute(async (_request, ctx) => Response.json({ bins: await bins(ctx) }));

export const POST = wmsRoute(async (request, ctx) => {
  const body = await readJson<Body>(request);
  const code = (body.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{0,30}$/.test(code)) return Response.json({ error: "invalid bin code" }, { status: 400 });
  const existing = await prisma.location.findFirst({ where: { warehouseId: ctx.warehouseId, code } });
  if (existing) return Response.json({ error: "bin code already exists" }, { status: 409 });
  const location = await prisma.location.create({ data: { warehouseId: ctx.warehouseId, code, name: (body.name ?? "").trim() || code, type: (body.type ?? "shelf").trim() || "shelf" } });
  return Response.json({ bin: { id: location.id, warehouseId: location.warehouseId, code: location.code, name: location.name, type: location.type, active: location.active, articles: 0, units: 0 } });
});
