import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dayKey, money, one, relativeDay, todayKey } from "@/lib/format";
import { purchaseStatus } from "@/lib/labels";
import { txMap } from "@/lib/i18n";
import { getLocale, translator } from "@/lib/i18n-server";
import { getBalances, needsReorder } from "@/server/snapshot";
import { Filters } from "@/components/filters";
import { Banner, Button, DataTable, PageIntro, Panel, Pill, Status, Tabs } from "@/components/ui";

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
        ...(q ? { OR: [{ number: { contains: q } }, { supplier: { name: { contains: q } } }] } : {}),
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
  return (
    <div>
      <PageIntro
        title={tx("Purchase orders")}
        actions={
          can(session.role, "purchasing.write") ? (
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
        <DataTable
          columns={[{ label: tx("Purchase order") }, { label: tx("Supplier") }, { label: tx("Expected") }, { label: tx("Status") }, { label: tx("Value"), align: "right" }]}
          rows={orders.map((order) => {
            const late = !!order.expectedAt && ["ordered", "partial"].includes(order.status) && dayKey(order.expectedAt) < today;
            return {
              key: order.id,
              href: `/purchase-orders/${order.id}`,
              cells: [
                order.number,
                order.supplier.name,
                order.expectedAt ? <span key="e" className={late ? "font-medium text-danger" : "text-muted"}>{relativeDay(order.expectedAt, locale)}</span> : <span key="e" className="text-faint">—</span>,
                <span key="s" className="inline-flex gap-1.5">
                  <Status map={txMap(purchaseStatus, tx)} value={order.status} />
                  {late ? <Pill tone="danger">{tx("Overdue")}</Pill> : null}
                </span>,
                <span key="v" className="font-medium">{money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0))}</span>,
              ],
            };
          })}
          empty={{ title: tx("No purchase orders"), body: tx("Nothing here right now.") }}
        />
      </Panel>
    </div>
  );
}
