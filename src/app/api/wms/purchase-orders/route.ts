import { wmsRoute } from "@/server/wms/auth";
import { purchaseOrders } from "@/server/wms/data";

export const GET = wmsRoute(async (_request, ctx) => Response.json({ purchaseOrders: await purchaseOrders(ctx) }));
