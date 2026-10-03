import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dayKey, formatDay, money, one, relativeDay, todayKey } from "@/lib/format";
import { channels, orderStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { Filters } from "@/components/filters";
import { Banner, Button, DataTable, PageIntro, Panel, Pill, Status, Tabs } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Orders") };
}

const openStatuses = ["confirmed", "picking", "partial"];

export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const q = one(query.q);
  const channel = one(query.channel);
  const view = one(query.view);
  const today = todayKey();
  const [orders, views] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        organizationId: session.organization.id,
        ...(channel ? { channel } : {}),
        ...(q ? { OR: [{ number: { contains: q } }, { externalRef: { contains: q } }, { customer: { name: { contains: q } } }] } : {}),
      },
      include: { customer: true, lines: true },
      orderBy: { orderedAt: "desc" },
    }),
    prisma.savedView.findMany({ where: { organizationId: session.organization.id, entityType: "sales_order" } }),
  ]);
  const isLate = (order: (typeof orders)[number]) => !!order.promisedAt && openStatuses.includes(order.status) && dayKey(order.promisedAt) < today;
  const filters: Record<string, (order: (typeof orders)[number]) => boolean> = {
    open: (order) => openStatuses.includes(order.status),
    late: isLate,
    shipped: (order) => ["shipped", "delivered"].includes(order.status),
  };
  const visible = orders.filter(filters[view] ?? (() => true));
  const tab = (key: string, label: string) => ({
    href: `/sales-orders${key ? `?view=${key}` : ""}`,
    label,
    active: view === key || (!view && !key),
    count: key ? orders.filter(filters[key]).length : orders.length,
  });

  return (
    <div>
      <PageIntro title={tx("Orders")} actions={can(session.role, "sales.write") ? <Button href="/sales-orders/new">{tx("Create order")}</Button> : undefined} />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <Tabs
        items={[
          tab("", tx("All")),
          tab("open", tx("Open")),
          tab("late", tx("Late")),
          tab("shipped", tx("Shipped")),
          ...views.map((item) => ({ href: `/sales-orders?${item.query}`, label: item.name })),
        ]}
      />
      <Filters
        action="/sales-orders"
        q={q}
        placeholder={tx("Order, customer or shop number")}
        hidden={{ view }}
        selects={[{ name: "channel", value: channel, placeholder: tx("All channels"), options: Object.entries(channels).map(([value, label]) => ({ value, label: tx(label) })) }]}
      />
      <Panel flush>
        <DataTable
          columns={[{ label: tx("Order") }, { label: tx("Customer") }, { label: tx("Channel") }, { label: tx("Date") }, { label: tx("Promised") }, { label: tx("Status") }, { label: tx("Total"), align: "right" }]}
          rows={visible.map((order) => {
            const late = isLate(order);
            return {
              key: order.id,
              href: `/sales-orders/${order.id}`,
              cells: [
                order.number,
                order.customer.name,
                <span key="c" className="text-muted">{tx(channels[order.channel] ?? order.channel)}</span>,
                <span key="d" className="text-muted">{formatDay(order.orderedAt)}</span>,
                order.promisedAt ? <span key="p" className={late ? "font-medium text-danger" : "text-muted"}>{relativeDay(order.promisedAt, locale)}</span> : <span key="p" className="text-faint">—</span>,
                <span key="s" className="inline-flex gap-1.5">
                  <Status map={txMap(orderStatus, tx)} value={order.status} />
                  {late ? <Pill tone="danger">{tx("Late")}</Pill> : null}
                </span>,
                <span key="t" className="font-medium">{money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0))}</span>,
              ],
            };
          })}
          empty={{ title: tx("No orders"), body: tx("Nothing in this view.") }}
        />
      </Panel>
    </div>
  );
}
