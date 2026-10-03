import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDay, one } from "@/lib/format";
import { returnStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { DataTable, PageIntro, Panel, Status, Tabs } from "@/components/ui";

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
  const all = await prisma.return.findMany({
    where: { organizationId: session.organization.id },
    include: { customer: true, salesOrder: true, lines: true },
    orderBy: { createdAt: "desc" },
  });
  const visible = all.filter((entry) => !status || entry.status === status);
  const tab = (key: string, label: string) => ({
    href: `/returns${key ? `?status=${key}` : ""}`,
    label,
    active: status === key || (!status && !key),
    count: all.filter((entry) => !key || entry.status === key).length,
  });
  void locale;
  return (
    <div>
      <PageIntro title={tx("Returns")} description={tx("Created on the order. Receiving puts the goods back; refunding returns the money.")} />
      <Tabs items={[tab("", tx("All")), tab("requested", tx("Requested")), tab("received", tx("Received")), tab("refunded", tx("Refunded"))]} />
      <Panel flush>
        <DataTable
          columns={[{ label: tx("Return") }, { label: tx("Customer") }, { label: tx("Order") }, { label: tx("Reason") }, { label: tx("Date") }, { label: tx("Status") }]}
          rows={visible.map((entry) => ({
            key: entry.id,
            href: `/returns/${entry.id}`,
            cells: [
              entry.number,
              entry.customer.name,
              <span key="o" className="text-muted">{entry.salesOrder.number}</span>,
              <span key="r" className="text-muted">{entry.reason}</span>,
              <span key="d" className="text-muted">{formatDay(entry.createdAt)}</span>,
              <Status key="s" map={txMap(returnStatus, tx)} value={entry.status} />,
            ],
          }))}
          empty={{ title: tx("No returns"), body: tx("Returns come from a shipped order.") }}
        />
      </Panel>
    </div>
  );
}
