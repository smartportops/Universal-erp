import { getSession } from "@/lib/auth";
import { answerQuestion } from "@/server/assistant";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { message?: string } | null;
  if (!body?.message?.trim()) return Response.json({ error: "message fehlt" }, { status: 400 });
  const answer = await answerQuestion(session.organization.id, body.message);
  return Response.json(answer);
}
