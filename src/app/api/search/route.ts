import { getSession } from "@/lib/auth";
import { searchRecords } from "@/server/search";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await searchRecords(session.organization.id, query);
  return Response.json({ hits });
}
