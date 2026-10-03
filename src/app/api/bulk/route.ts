import { PDFDocument } from "pdf-lib";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { deliveryNotePdf, invoicePdf } from "@/server/commercial-pdf";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const form = await request.formData();
  const entity = String(form.get("entity") || "");
  const action = String(form.get("action") || "");
  const ids = [...new Set(form.getAll("ids").map(String).filter(Boolean))].slice(0, 500);
  const locale = await getLocale();
  const orgId = session.organization.id;

  let render: ((id: string) => Promise<{ body: Buffer } | null>) | null = null;
  let filename = "documents.pdf";
  if (entity === "sales_order" && action === "delivery_notes") {
    render = (id) => deliveryNotePdf(orgId, id, locale);
    filename = locale === "de" ? "lieferscheine.pdf" : "delivery-notes.pdf";
  } else if (entity === "invoice" && action === "pdfs") {
    render = (id) => invoicePdf(orgId, id, locale);
    filename = locale === "de" ? "rechnungen.pdf" : "invoices.pdf";
  }
  if (!render) return new Response("Not found", { status: 404 });

  const merged = await PDFDocument.create();
  let count = 0;
  for (const id of ids) {
    const pdf = await render(id).catch(() => null);
    if (!pdf) continue;
    const source = await PDFDocument.load(pdf.body);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
    count += 1;
  }
  if (count === 0) return new Response("Nothing to download", { status: 404 });
  const bytes = await merged.save();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
