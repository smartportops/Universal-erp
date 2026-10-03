import { wmsRoute } from "@/server/wms/auth";
import { pickProfiles } from "@/server/wms/data";

export const GET = wmsRoute(async (_request, ctx) => Response.json({ profiles: await pickProfiles(ctx) }));
