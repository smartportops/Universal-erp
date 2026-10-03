import { createHash } from "crypto";
import { prisma } from "@/lib/db";

export type WmsContext = {
  organizationId: string;
  /** user the bookings are attributed to (first owner/admin of the organisation) */
  actorId: string;
  /** warehouse the station works for (from `?warehouse=`, falls back to the default warehouse) */
  warehouseId: string;
  keyId: string;
};

export class WmsHttpError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Authenticates a WMS request with an organisation API key
 * (`Authorization: Bearer aera_…`, created under Settings → API).
 */
export async function wmsContext(request: Request): Promise<WmsContext> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("aera_")) throw new WmsHttpError("unauthorized", 401);
  const hash = createHash("sha256").update(token).digest("hex");
  const key = await prisma.apiKey.findUnique({ where: { hash } });
  if (!key) throw new WmsHttpError("unauthorized", 401);
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });

  const membership =
    (await prisma.membership.findFirst({ where: { organizationId: key.organizationId, role: "owner" }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.membership.findFirst({ where: { organizationId: key.organizationId, role: "admin" }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.membership.findFirst({ where: { organizationId: key.organizationId }, orderBy: { createdAt: "asc" } }));
  if (!membership) throw new WmsHttpError("organisation has no members", 403);

  const requested = new URL(request.url).searchParams.get("warehouse") ?? "";
  const warehouse =
    (requested ? await prisma.warehouse.findFirst({ where: { id: requested, organizationId: key.organizationId } }) : null) ??
    (await prisma.warehouse.findFirst({ where: { organizationId: key.organizationId, isDefault: true } })) ??
    (await prisma.warehouse.findFirst({ where: { organizationId: key.organizationId }, orderBy: { createdAt: "asc" } }));
  if (!warehouse) throw new WmsHttpError("organisation has no warehouse", 409);

  return { organizationId: key.organizationId, actorId: membership.userId, warehouseId: warehouse.id, keyId: key.id };
}

/** Wraps a route handler: auth + uniform JSON errors. */
export function wmsRoute<T extends Record<string, string>>(
  handler: (request: Request, ctx: WmsContext, params: T) => Promise<Response>,
) {
  return async (request: Request, route?: { params: Promise<T> }) => {
    try {
      const ctx = await wmsContext(request);
      const params = route ? await route.params : ({} as T);
      return await handler(request, ctx, params);
    } catch (error) {
      if (error instanceof WmsHttpError) return Response.json({ error: error.message }, { status: error.status });
      const message = error instanceof Error ? error.message : "error";
      return Response.json({ error: message }, { status: 400 });
    }
  };
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
