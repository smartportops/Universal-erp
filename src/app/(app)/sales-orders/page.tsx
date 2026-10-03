import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dayKey, formatDay, money, one, relativeDay, todayKey } from "@/lib/format";
import { channels, orderStatus, priorities } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { exportHref, paginate } from "@/lib/paging";
import { Filters } from "@/components/filters";
import { ListTable } from "@/components/list-table";
import { Banner, Button, PageIntro, Panel, Pill, Status, Tabs } from "@/components/ui";

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
        ...(q ? { OR: [{ number: { contains: q } }, { externalRef: { contains: q } }, { customer: { name: { contains: q, mode: "insensitive" } } }] } : {}),
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
  const { page, total, rows } = paginate(visible, query);
  const tab = (key: string, label: string) => ({
    href: `/sales-orders${key ? `?view=${key}` : ""}`,
    label,
    active: view === key || (!view && !key),
    count: key ? orders.filter(filters[key]).length : orders.length,
  });
  const canSales = can(session.role, "sales.write");
  const canFinance = can(session.role, "finance.write");
  const actions = [
    { key: "delivery_notes", label: "Download delivery notes", download: true },
    ...(canFinance ? [{ key: "invoice", label: "Create invoices" }] : []),
    ...(canSales
      ? [
          { key: "hold", label: "Put on hold" },
          { key: "release", label: "Release" },
          { key: "complete", label: "Mark as completed" },
          { key: "cancel", label: "Cancel orders", tone: "danger" as const },
        ]
      : []),
  ];

  return (
    <div>
      <PageIntro title={tx("Orders")} actions={canSales ? <Button href="/sales-orders/new">{tx("Create order")}</Button> : undefined} />
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
        <ListTable
          id="sales-orders"
          page={page}
          total={total}
          exportHref={exportHref("sales-orders", query)}
          bulk={{ entity: "sales_order", actions, allIds: visible.map((order) => order.id) }}
          columns={[
            { key: "number", label: tx("Order") },
            { key: "customer", label: tx("Customer") },
            { key: "channel", label: tx("Channel") },
            { key: "date", label: tx("Date") },
            { key: "promised", label: tx("Promised") },
            { key: "priority", label: tx("Priority") },
            { key: "status", label: tx("Status") },
            { key: "total", label: tx("Total"), align: "right" },
          ]}
          rows={rows.map((order) => {
            const late = isLate(order);
            return {
              key: order.id,
              href: `/sales-orders/${order.id}`,
              cells: {
                number: order.number,
                customer: order.customer.name,
                channel: <span className="text-muted">{tx(channels[order.channel] ?? order.channel)}</span>,
                date: <span className="text-muted">{formatDay(order.orderedAt)}</span>,
                promised: order.promisedAt ? <span className={late ? "font-medium text-danger" : "text-muted"}>{relativeDay(order.promisedAt, locale)}</span> : <span className="text-faint">—</span>,
                priority: <span className={order.priority === "urgent" || order.priority === "high" ? "font-medium text-danger" : "text-muted"}>{tx(priorities[order.priority] ?? order.priority)}</span>,
                status: (
                  <span className="inline-flex gap-1.5">
                    <Status map={txMap(orderStatus, tx)} value={order.status} />
                    {order.onHold ? <Pill tone="warning">{tx("On hold")}</Pill> : null}
                    {late ? <Pill tone="danger">{tx("Late")}</Pill> : null}
                  </span>
                ),
                total: <span className="font-medium">{money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0))}</span>,
              },
            };
          })}
          empty={{ title: tx("No orders"), body: tx("Nothing in this view.") }}
        />
      </Panel>
    </div>
  );
}
