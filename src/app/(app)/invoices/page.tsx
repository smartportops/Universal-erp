import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dayKey, formatDay, money, one, todayKey } from "@/lib/format";
import { invoiceKinds, invoiceStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { invoiceOpenAmount, signedInvoiceNet } from "@/lib/invoices";
import { exportHref, paginate } from "@/lib/paging";
import { Filters } from "@/components/filters";
import { ListTable } from "@/components/list-table";
import { Banner, PageIntro, Panel, Pill, Stat, Status } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Invoices") };
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const q = one(query.q);
  const kind = one(query.kind);
  const today = todayKey();
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: session.organization.id,
      ...(q ? { OR: [{ number: { contains: q } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { customer: true, payments: true, salesOrder: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
  });
  const credited = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.kind === "credit" && invoice.correctsId && !["cancelled", "void"].includes(invoice.status)) {
      credited.set(invoice.correctsId, (credited.get(invoice.correctsId) ?? 0) + invoice.totalCents);
    }
  }
  const enriched = invoices.map((invoice) => {
    const open = invoiceOpenAmount(invoice, credited.get(invoice.id) ?? 0);
    const overdue = open > 0 && !!invoice.dueAt && dayKey(invoice.dueAt) < today;
    const display = signedInvoiceNet({ ...invoice, netCents: invoice.totalCents });
    return { ...invoice, open, overdue, display };
  });
  const visible = enriched.filter((row) => !kind || row.kind === kind);
  const openTotal = enriched.reduce((sum, row) => sum + row.open, 0);
  const overdueTotal = enriched.filter((row) => row.overdue).reduce((sum, row) => sum + row.open, 0);
  const kindOptions = ["invoice", "cancellation", "credit", "credit_cancellation"];
  const canFinance = can(session.role, "finance.write");
  const { page, total, rows } = paginate(visible, query);
  void locale;

  return (
    <div>
      <PageIntro title={tx("Invoices")} description={tx("Invoices, cancellation invoices and credit notes. Issued documents stay as they are. A correction is always a new document.")} />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Stat label={tx("Open")} value={money(openTotal)} />
        <Stat label={tx("Of which overdue")} value={money(overdueTotal)} tone={overdueTotal ? "danger" : undefined} />
      </div>
      <Filters
        action="/invoices"
        q={q}
        placeholder={tx("Number or customer")}
        selects={[{ name: "kind", value: kind, placeholder: tx("All documents"), options: kindOptions.map((key) => ({ value: key, label: tx(invoiceKinds[key]) })) }]}
      />
      <Panel flush>
        <ListTable
          id="invoices"
          page={page}
          total={total}
          exportHref={exportHref("invoices", query)}
          bulk={{
            entity: "invoice",
            allIds: visible.map((invoice) => invoice.id),
            actions: [{ key: "pdfs", label: "Download PDFs", download: true }, ...(canFinance ? [{ key: "cancel", label: "Create cancellation invoices", tone: "danger" as const }] : [])],
          }}
          columns={[
            { key: "number", label: tx("Invoice") },
            { key: "kind", label: tx("Type") },
            { key: "customer", label: tx("Customer") },
            { key: "order", label: tx("Order") },
            { key: "issued", label: tx("Issued") },
            { key: "due", label: tx("Due") },
            { key: "status", label: tx("Status") },
            { key: "amount", label: tx("Amount"), align: "right" },
            { key: "open", label: tx("Open"), align: "right" },
          ]}
          rows={rows.map((invoice) => ({
            key: invoice.id,
            href: `/invoices/${invoice.id}`,
            cells: {
              number: invoice.number,
              kind: tx(invoiceKinds[invoice.kind] ?? invoice.kind),
              customer: invoice.customer.name,
              order: <span className="text-muted">{invoice.salesOrder?.number ?? "—"}</span>,
              issued: <span className="text-muted">{formatDay(invoice.issuedAt)}</span>,
              due: <span className={invoice.overdue ? "font-medium text-danger" : "text-muted"}>{formatDay(invoice.dueAt)}</span>,
              status: (
                <span className="inline-flex gap-1.5">
                  <Status map={txMap(invoiceStatus, tx)} value={invoice.status} />
                  {invoice.overdue ? <Pill tone="danger">{tx("Overdue")}</Pill> : null}
                </span>
              ),
              amount: money(invoice.display),
              open: <span className={invoice.open ? "font-medium" : "text-faint"}>{money(invoice.open)}</span>,
            },
          }))}
          empty={{ title: tx("No invoices"), body: tx("Invoices are created from orders.") }}
        />
      </Panel>
    </div>
  );
}
