import { wmsRoute } from "@/server/wms/auth";
import { orders } from "@/server/wms/data";

export const GET = wmsRoute(async (request, ctx) => {
  const params = new URL(request.url).searchParams;
  const list = await orders(ctx, {
    status: params.get("status") ?? undefined,
    q: params.get("q") ?? undefined,
    number: params.get("number") ?? undefined,
    customer: params.get("customer") ?? undefined,
    tracking: params.get("tracking") ?? undefined,
  });
  return Response.json({ orders: list });
});
