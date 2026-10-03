import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dayKey, formatDay, money, one, relativeDay, todayKey } from "@/lib/format";
import { purchaseStatus } from "@/lib/labels";
import { txMap } from "@/lib/i18n";
import { getLocale, translator } from "@/lib/i18n-server";
import { exportHref, paginate } from "@/lib/paging";
import { getBalances, needsReorder } from "@/server/snapshot";
import { Filters } from "@/components/filters";
import { ListTable } from "@/components/list-table";
import { Banner, Button, PageIntro, Panel, Pill, Status, Tabs } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Purchase orders") };
}

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const q = one(query.q);
  const status = one(query.status);
  const today = todayKey();
  const [orders, all, balances] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        organizationId: session.organization.id,
        ...(status === "open" ? { status: { in: ["ordered", "partial"] } } : status ? { status } : {}),
        ...(q ? { OR: [{ number: { contains: q } }, { supplier: { name: { contains: q, mode: "insensitive" } } }] } : {}),
      },
      include: { supplier: true, lines: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseOrder.findMany({ where: { organizationId: session.organization.id }, select: { status: true } }),
    getBalances(session.organization.id),
  ]);
  const reorderCount = balances.filter(needsReorder).length;
  const tab = (key: string, label: string) => ({
    href: `/purchase-orders${key ? `?status=${key}` : ""}`,
    label,
    active: status === key || (!status && !key),
    count: all.filter((item) => !key || (key === "open" ? ["ordered", "partial"].includes(item.status) : item.status === key)).length,
  });
  const writable = can(session.role, "purchasing.write");
  const { page, total, rows } = paginate(orders, query);
  return (
    <div>
      <PageIntro
        title={tx("Purchase orders")}
        actions={
          writable ? (
            <>
              <Button href="/reorder" variant="secondary">{reorderCount ? tx("Reorder suggestions ({count})", { count: reorderCount }) : tx("Reorder suggestions")}</Button>
              <Button href="/purchase-orders/new">{tx("Create purchase order")}</Button>
            </>
          ) : undefined
        }
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <Tabs items={[tab("", tx("All")), tab("draft", tx("Draft")), tab("open", tx("In transit")), tab("received", tx("Received"))]} />
      <Filters action="/purchase-orders" q={q} placeholder={tx("Number or supplier")} hidden={{ status }} />
      <Panel flush>
        <ListTable
          id="purchase-orders"
          page={page}
          total={total}
          exportHref={exportHref("purchase-orders", query)}
          bulk={
            writable
              ? {
                  entity: "purchase_order",
                  allIds: orders.map((order) => order.id),
                  actions: [
                    { key: "order", label: "Mark as ordered" },
                    { key: "cancel", label: "Cancel purchase orders", tone: "danger" },
                  ],
                }
              : undefined
          }
          columns={[
            { key: "number", label: tx("Purchase order") },
            { key: "supplier", label: tx("Supplier") },
            { key: "created", label: tx("Date") },
            { key: "expected", label: tx("Expected") },
            { key: "lines", label: tx("Lines"), align: "right" },
            { key: "status", label: tx("Status") },
            { key: "value", label: tx("Value"), align: "right" },
          ]}
          rows={rows.map((order) => {
            const late = !!order.expectedAt && ["ordered", "partial"].includes(order.status) && dayKey(order.expectedAt) < today;
            return {
              key: order.id,
              href: `/purchase-orders/${order.id}`,
              cells: {
                number: order.number,
                supplier: order.supplier.name,
                created: <span className="text-muted">{formatDay(order.createdAt)}</span>,
                expected: order.expectedAt ? <span className={late ? "font-medium text-danger" : "text-muted"}>{relativeDay(order.expectedAt, locale)}</span> : <span className="text-faint">—</span>,
                lines: order.lines.length,
                status: (
                  <span className="inline-flex gap-1.5">
                    <Status map={txMap(purchaseStatus, tx)} value={order.status} />
                    {late ? <Pill tone="danger">{tx("Overdue")}</Pill> : null}
                  </span>
                ),
                value: <span className="font-medium">{money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0))}</span>,
              },
            };
          })}
          empty={{ title: tx("No purchase orders"), body: tx("Nothing here right now.") }}
        />
      </Panel>
    </div>
  );
}
