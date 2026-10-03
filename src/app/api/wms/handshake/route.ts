import { wmsRoute } from "@/server/wms/auth";
import { handshake } from "@/server/wms/data";

export const GET = wmsRoute(async (_request, ctx) => Response.json(await handshake(ctx)));
