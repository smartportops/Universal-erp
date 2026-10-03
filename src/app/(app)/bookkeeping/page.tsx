import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDay, money, one } from "@/lib/format";
import { translator } from "@/lib/i18n-server";
import { exportHref, paginate } from "@/lib/paging";
import { parseDay } from "@/lib/period";
import { FinanceTabs } from "@/components/finance-tabs";
import { ListTable } from "@/components/list-table";
import { Banner, PageIntro, Panel, Pill, Stat, fieldClass } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Journal") };
}

const sources: Record<string, string> = {
  invoice: "Invoice",
  payment: "Payment",
  return: "Return",
  purchase_order: "Purchase order",
  shipment: "Shipment",
  voucher: "Voucher",
  voucher_void: "Reversal",
};

function sourceHref(type: string, id: string) {
  const bases: Record<string, string> = {
    invoice: "/invoices/",
    payment: "/invoices/",
    return: "/returns/",
    purchase_order: "/purchase-orders/",
    shipment: "/shipments/",
    voucher: "/vouchers/",
    voucher_void: "/vouchers/",
  };
  return bases[type] && id ? `${bases[type]}${id}` : undefined;
}

export default async function BookkeepingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const session = await requireUser();
  const query = await searchParams;
  const from = parseDay(one(query.from));
  const to = parseDay(one(query.to));
  const toExclusive = to ? new Date(to.getTime() + 86_400_000) : null;
  const [totals, entries] = await Promise.all([
    prisma.journalLine.aggregate({ where: { entry: { organizationId: session.organization.id } }, _sum: { debitCents: true, creditCents: true } }),
    prisma.journalEntry.findMany({
      where: {
        organizationId: session.organization.id,
        ...(from || toExclusive ? { entryDate: { ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } } : {}),
      },
      include: { lines: true },
      orderBy: [{ entryDate: "desc" }, { number: "desc" }],
    }),
  ]);
  const debit = totals._sum.debitCents ?? 0;
  const credit = totals._sum.creditCents ?? 0;
  const { page, total, rows } = paginate(entries, query);
  return (
    <div>
      <PageIntro
        title={tx("Journal")}
        description={tx("Every posting, from invoices and payments to uploaded vouchers. The journal is append-only: a correction is a new entry.")}
        badges={debit === credit ? <Pill tone="ok">{tx("Balanced")}</Pill> : <Pill tone="danger">{tx("Difference")}</Pill>}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <FinanceTabs active="journal" tx={tx} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Stat label={tx("Total debits")} value={money(debit)} />
        <Stat label={tx("Total credits")} value={money(credit)} />
      </div>
      <form action="/bookkeeping" className="mb-3 flex flex-wrap items-center gap-2">
        <input type="date" name="from" defaultValue={one(query.from)} className={`${fieldClass} w-auto`} aria-label={tx("From date")} />
        <input type="date" name="to" defaultValue={one(query.to)} className={`${fieldClass} w-auto`} aria-label={tx("To date")} />
        <button className="h-9 rounded-lg bg-surface px-3 text-[13px] font-medium ring-1 ring-line-strong hover:bg-subtle" type="submit">{tx("Show")}</button>
      </form>
      <Panel flush>
        <ListTable
          id="journal"
          page={page}
          total={total}
          exportHref={exportHref("journal", query)}
          columns={[
            { key: "date", label: tx("Date") },
            { key: "number", label: tx("Number") },
            { key: "memo", label: tx("Memo") },
            { key: "source", label: tx("Source") },
            { key: "amount", label: tx("Amount"), align: "right" },
          ]}
          rows={rows.map((entry) => ({
            key: entry.id,
            href: sourceHref(entry.sourceType, entry.sourceId),
            cells: {
              date: <span className="text-muted">{formatDay(entry.entryDate)}</span>,
              number: entry.number,
              memo: entry.memo,
              source: <span className="text-muted">{tx(sources[entry.sourceType] ?? entry.sourceType)}</span>,
              amount: <span className="font-medium">{money(entry.lines.reduce((sum, line) => sum + line.debitCents, 0))}</span>,
            },
          }))}
          empty={{ title: tx("No entries"), body: tx("Postings appear when you issue invoices, pay them, receive goods or book a voucher.") }}
        />
      </Panel>
    </div>
  );
}
