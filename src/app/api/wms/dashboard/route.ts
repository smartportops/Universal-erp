import { wmsRoute } from "@/server/wms/auth";
import { dashboard } from "@/server/wms/data";

export const GET = wmsRoute(async (_request, ctx) => Response.json(await dashboard(ctx)));
