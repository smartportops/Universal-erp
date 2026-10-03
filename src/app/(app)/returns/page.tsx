import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDay, one } from "@/lib/format";
import { returnStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { exportHref, paginate } from "@/lib/paging";
import { Filters } from "@/components/filters";
import { ListTable } from "@/components/list-table";
import { Banner, PageIntro, Panel, Status, Tabs } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Returns") };
}

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const status = one(query.status);
  const q = one(query.q);
  const all = await prisma.return.findMany({
    where: { organizationId: session.organization.id },
    include: { customer: true, salesOrder: true, lines: true },
    orderBy: { createdAt: "desc" },
  });
  const needle = q.toLowerCase();
  const visible = all.filter((entry) => (!status || entry.status === status) && (!needle || [entry.number, entry.customer.name, entry.salesOrder.number, entry.reason].some((text) => text.toLowerCase().includes(needle))));
  const tab = (key: string, label: string) => ({
    href: `/returns${key ? `?status=${key}` : ""}`,
    label,
    active: status === key || (!status && !key),
    count: all.filter((entry) => !key || entry.status === key).length,
  });
  const { page, total, rows } = paginate(visible, query);
  void locale;
  return (
    <div>
      <PageIntro title={tx("Returns")} description={tx("Created on the order. Receiving puts the goods back; refunding returns the money.")} />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <Tabs items={[tab("", tx("All")), tab("requested", tx("Requested")), tab("received", tx("Received")), tab("refunded", tx("Refunded"))]} />
      <Filters action="/returns" q={q} placeholder={tx("Return, order or customer")} hidden={{ status }} />
      <Panel flush>
        <ListTable
          id="returns"
          page={page}
          total={total}
          exportHref={exportHref("returns", query)}
          columns={[
            { key: "number", label: tx("Return") },
            { key: "customer", label: tx("Customer") },
            { key: "order", label: tx("Order") },
            { key: "reason", label: tx("Reason") },
            { key: "items", label: tx("Items"), align: "right" },
            { key: "date", label: tx("Date") },
            { key: "status", label: tx("Status") },
          ]}
          rows={rows.map((entry) => ({
            key: entry.id,
            href: `/returns/${entry.id}`,
            cells: {
              number: entry.number,
              customer: entry.customer.name,
              order: <span className="text-muted">{entry.salesOrder.number}</span>,
              reason: <span className="text-muted">{entry.reason}</span>,
              items: entry.lines.reduce((sum, line) => sum + line.quantity, 0),
              date: <span className="text-muted">{formatDay(entry.createdAt)}</span>,
              status: <Status map={txMap(returnStatus, tx)} value={entry.status} />,
            },
          }))}
          empty={{ title: tx("No returns"), body: tx("Returns come from a shipped order.") }}
        />
      </Panel>
    </div>
  );
}
