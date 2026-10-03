import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dayKey, formatDay, money, one, todayKey } from "@/lib/format";
import { invoiceKinds, invoiceStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { invoiceOpenAmount, signedInvoiceNet } from "@/lib/invoices";
import { Filters } from "@/components/filters";
import { DataTable, PageIntro, Panel, Pill, Stat, Status, fieldClass } from "@/components/ui";

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
      ...(q ? { OR: [{ number: { contains: q } }, { customer: { name: { contains: q } } }] } : {}),
    },
    include: { customer: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
  const credited = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.kind === "credit" && invoice.correctsId && !["cancelled", "void"].includes(invoice.status)) {
      credited.set(invoice.correctsId, (credited.get(invoice.correctsId) ?? 0) + invoice.totalCents);
    }
  }
  const rows = invoices.map((invoice) => {
    const open = invoiceOpenAmount(invoice, credited.get(invoice.id) ?? 0);
    const overdue = open > 0 && !!invoice.dueAt && dayKey(invoice.dueAt) < today;
    const display = signedInvoiceNet({ ...invoice, netCents: invoice.totalCents });
    return { ...invoice, open, overdue, display };
  });
  const visible = rows.filter((row) => !kind || row.kind === kind);
  const openTotal = rows.reduce((sum, row) => sum + row.open, 0);
  const overdueTotal = rows.filter((row) => row.overdue).reduce((sum, row) => sum + row.open, 0);
  const kindOptions = ["", "invoice", "cancellation", "credit", "credit_cancellation"];
  void locale;

  return (
    <div>
      <PageIntro title={tx("Invoices")} description={tx("Invoices, cancellation invoices and credit notes. Issued documents stay as they are. A correction is always a new document.")} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Stat label={tx("Open")} value={money(openTotal)} />
        <Stat label={tx("Of which overdue")} value={money(overdueTotal)} tone={overdueTotal ? "danger" : undefined} />
      </div>
      <form action="/invoices" className="mb-3 flex flex-wrap items-center gap-2">
        {q ? <input type="hidden" name="q" value={q} /> : null}
        <select name="kind" defaultValue={kind} className={`${fieldClass} w-auto min-w-56`}>
          {kindOptions.map((key) => (
            <option key={key || "all"} value={key}>{tx(key ? invoiceKinds[key] : "All documents")}</option>
          ))}
        </select>
        <button className="h-9 rounded-lg bg-surface px-3 text-[13px] font-medium ring-1 ring-line-strong hover:bg-subtle" type="submit">{tx("Apply")}</button>
      </form>
      <Filters action="/invoices" q={q} placeholder={tx("Number or customer")} hidden={{ kind }} />
      <Panel flush>
        <DataTable
          columns={[{ label: tx("Invoice") }, { label: tx("Type") }, { label: tx("Customer") }, { label: tx("Due") }, { label: tx("Status") }, { label: tx("Amount"), align: "right" }, { label: tx("Open"), align: "right" }]}
          rows={visible.map((invoice) => ({
            key: invoice.id,
            href: `/invoices/${invoice.id}`,
            cells: [
              invoice.number,
              tx(invoiceKinds[invoice.kind] ?? invoice.kind),
              invoice.customer.name,
              <span key="d" className={invoice.overdue ? "font-medium text-danger" : "text-muted"}>{formatDay(invoice.dueAt)}</span>,
              <span key="s" className="inline-flex gap-1.5">
                <Status map={txMap(invoiceStatus, tx)} value={invoice.status} />
                {invoice.overdue ? <Pill tone="danger">{tx("Overdue")}</Pill> : null}
              </span>,
              money(invoice.display),
              <span key="o" className={invoice.open ? "font-medium" : "text-faint"}>{money(invoice.open)}</span>,
            ],
          }))}
          empty={{ title: tx("No invoices"), body: tx("Invoices are created from fully shipped orders.") }}
        />
      </Panel>
    </div>
  );
}
