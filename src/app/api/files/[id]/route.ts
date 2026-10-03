import { readFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const file = await prisma.attachment.findFirst({
    where: { id, organizationId: session.organization.id },
  });
  if (!file) return new Response("Not found", { status: 404 });
  const root = path.resolve(process.cwd(), "data", "uploads");
  const full = path.resolve(root, file.storageKey);
  if (!full.startsWith(root + path.sep)) return new Response("Bad path", { status: 400 });
  const data = await readFile(full);
  return new Response(data, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
    },
  });
}
