import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dayKey, formatDay, money, one, todayKey } from "@/lib/format";
import { invoiceStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { Filters } from "@/components/filters";
import { DataTable, PageIntro, Panel, Pill, Stat, Status, Tabs } from "@/components/ui";

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
  const view = one(query.view);
  const today = todayKey();
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: session.organization.id,
      ...(q ? { OR: [{ number: { contains: q } }, { customer: { name: { contains: q } } }] } : {}),
    },
    include: { customer: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
  const rows = invoices.map((invoice) => {
    const paid = invoice.payments.filter((payment) => payment.status === "settled").reduce((sum, payment) => sum + payment.amountCents, 0);
    const open = ["issued", "partial"].includes(invoice.status) ? invoice.totalCents - paid : 0;
    const overdue = open > 0 && !!invoice.dueAt && dayKey(invoice.dueAt) < today;
    return { ...invoice, open, overdue };
  });
  const filters: Record<string, (row: (typeof rows)[number]) => boolean> = {
    open: (row) => row.open > 0,
    overdue: (row) => row.overdue,
    paid: (row) => row.status === "paid",
  };
  const visible = rows.filter(filters[view] ?? (() => true));
  const tab = (key: string, label: string) => ({
    href: `/invoices${key ? `?view=${key}` : ""}`,
    label,
    active: view === key || (!view && !key),
    count: key ? rows.filter(filters[key]).length : rows.length,
  });
  const openTotal = rows.reduce((sum, row) => sum + row.open, 0);
  const overdueTotal = rows.filter((row) => row.overdue).reduce((sum, row) => sum + row.open, 0);
  void locale;

  return (
    <div>
      <PageIntro title={tx("Invoices")} description={tx("Created from shipped orders. Payments settle the open balance.")} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Stat label={tx("Open")} value={money(openTotal)} />
        <Stat label={tx("Of which overdue")} value={money(overdueTotal)} tone={overdueTotal ? "danger" : undefined} />
      </div>
      <Tabs items={[tab("", tx("All")), tab("open", tx("Open")), tab("overdue", tx("Overdue")), tab("paid", tx("Paid"))]} />
      <Filters action="/invoices" q={q} placeholder={tx("Number or customer")} hidden={{ view }} />
      <Panel flush>
        <DataTable
          columns={[{ label: tx("Invoice") }, { label: tx("Customer") }, { label: tx("Due") }, { label: tx("Status") }, { label: tx("Amount"), align: "right" }, { label: tx("Open"), align: "right" }]}
          rows={visible.map((invoice) => ({
            key: invoice.id,
            href: `/invoices/${invoice.id}`,
            cells: [
              invoice.number,
              invoice.customer.name,
              <span key="d" className={invoice.overdue ? "font-medium text-danger" : "text-muted"}>{formatDay(invoice.dueAt)}</span>,
              <span key="s" className="inline-flex gap-1.5">
                <Status map={txMap(invoiceStatus, tx)} value={invoice.status} />
                {invoice.overdue ? <Pill tone="danger">{tx("Overdue")}</Pill> : null}
              </span>,
              money(invoice.totalCents),
              <span key="o" className={invoice.open ? "font-medium" : "text-faint"}>{money(invoice.open)}</span>,
            ],
          }))}
          empty={{ title: tx("No invoices"), body: tx("Invoices are created from fully shipped orders.") }}
        />
      </Panel>
    </div>
  );
}
