import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { quotePdf } from "@/server/commercial-pdf";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const locale = await getLocale();
  const pdf = await quotePdf(session.organization.id, id, locale);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf.body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
    },
  });
}
