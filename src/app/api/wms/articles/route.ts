import { wmsRoute } from "@/server/wms/auth";
import { articles } from "@/server/wms/data";

export const GET = wmsRoute(async (request, ctx) => Response.json({ articles: await articles(ctx, new URL(request.url).searchParams.get("q") ?? "") }));
