import { wmsRoute } from "@/server/wms/auth";
import { movements } from "@/server/wms/data";

export const GET = wmsRoute(async (request, ctx) => Response.json({ movements: await movements(ctx, Number(new URL(request.url).searchParams.get("limit") ?? 50) || 50) }));
