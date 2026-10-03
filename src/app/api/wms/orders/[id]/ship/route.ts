import { prisma } from "@/lib/db";
import { shipSalesOrder } from "@/server/domain/commerce";
import { readJson, wmsRoute } from "@/server/wms/auth";

type Body = { carrier?: string; trackingNumber?: string; quantities?: Record<string, number> };

/** Creates the shipment, books the stock movements and marks the order shipped/partial. */
export const POST = wmsRoute<{ id: string }>(async (request, ctx, params) => {
  const body = await readJson<Body>(request);
  const quantities = body.quantities && Object.values(body.quantities).some((q) => q > 0) ? body.quantities : undefined;
  const shipment = await shipSalesOrder(prisma, {
    organizationId: ctx.organizationId,
    actorId: ctx.actorId,
    salesOrderId: params.id,
    carrier: body.carrier?.trim() || "DHL",
    trackingNumber: body.trackingNumber?.trim() || undefined,
    quantitiesByVariant: quantities,
  });
  return Response.json({ ok: true, shipmentNumber: shipment.number, shipmentId: shipment.id });
});
