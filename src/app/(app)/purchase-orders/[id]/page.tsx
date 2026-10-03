import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dayKey, formatDay, money, one, qty, todayKey, toDateInput } from "@/lib/format";
import { purchaseStatus } from "@/lib/labels";
import { txMap } from "@/lib/i18n";
import { getLocale, translator } from "@/lib/i18n-server";
import { orderPurchase, receivePurchase } from "@/server/actions/catalog";
import { entityExtras } from "@/server/entity";
import { ActivityFeed, DetailLayout, EntityFields } from "@/components/entity-panel";
import { InlineEdit } from "@/components/inline-edit";
import { Banner, PageIntro, Panel, Pill, Properties, Status, Thumb } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const order = await prisma.purchaseOrder.findUnique({ where: { id } });
  return { title: order?.number ?? tx("Purchase order") };
}

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, organizationId: session.organization.id },
    include: { supplier: true, warehouse: true, lines: { include: { variant: { include: { product: true } } } } },
  });
  if (!order) notFound();
  const extras = await entityExtras(session.organization.id, "purchase_order", order.id);
  const open = ["ordered", "partial"].includes(order.status);
  const overdue = open && !!order.expectedAt && dayKey(order.expectedAt) < todayKey();
  const writable = can(session.role, "purchasing.write");
  const total = order.lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
  const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const received = order.lines.reduce((sum, line) => sum + line.receivedQty, 0);

  return (
    <div>
      <PageIntro
        back={{ href: "/purchase-orders", label: tx("Purchase orders") }}
        eyebrow={<Link href={`/suppliers/${order.supplierId}`} className="hover:text-ink hover:underline">{order.supplier.name}</Link>}
        title={order.number}
        badges={
          <>
            <Status map={txMap(purchaseStatus, tx)} value={order.status} />
            {overdue ? <Pill tone="danger">{tx("Overdue")}</Pill> : null}
          </>
        }
        actions={
          <>
            {writable && order.status === "draft" ? (
              <form action={orderPurchase}><input type="hidden" name="id" value={order.id} /><SubmitButton>{tx("Order from supplier")}</SubmitButton></form>
            ) : null}
            {can(session.role, "stock.write") && open ? (
              <form action={receivePurchase}><input type="hidden" name="id" value={order.id} /><SubmitButton>{tx("Post goods receipt")}</SubmitButton></form>
            ) : null}
          </>
        }
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <DetailLayout
        side={
          <>
            <Panel title={tx("Details")}>
              <Properties
                items={[
                  { label: tx("Supplier"), value: <Link href={`/suppliers/${order.supplierId}`} className="hover:underline">{order.supplier.name}</Link> },
                  { label: tx("Warehouse"), value: order.warehouse.name },
                  { label: tx("Ordered"), value: formatDay(order.orderedAt) },
                  {
                    label: tx("Expected"),
                    value: (
                      <InlineEdit
                        entity="purchase_order"
                        id={order.id}
                        field="expectedAt"
                        type="date"
                        value={toDateInput(order.expectedAt)}
                        display={<span className={overdue ? "font-medium text-danger" : ""}>{formatDay(order.expectedAt)}</span>}
                        disabled={!writable || order.status === "received"}
                        placeholder={tx("Set a date")}
                      />
                    ),
                  },
                  { label: tx("Receipt"), value: tx("{received} of {units}", { received: qty(received), units: qty(units) }) },
                ]}
              />
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1 text-[13px] text-muted">{tx("Note")}</div>
                <InlineEdit entity="purchase_order" id={order.id} field="notes" type="textarea" value={order.notes} disabled={!writable} placeholder={tx("Note for purchasing")} />
              </div>
            </Panel>
            <EntityFields entityId={order.id} fields={extras.fields} files={extras.files} canEdit={can(session.role, "comments.write")} />
          </>
        }
      >
        <Panel title={tx("Lines")} flush>
          <ul>
            {order.lines.map((line) => {
              const done = line.receivedQty >= line.quantity;
              return (
                <li key={line.id} className="flex items-center gap-3 border-t border-line px-5 py-3 text-[13px]">
                  <Thumb label={line.variant.product.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <Link href={`/products/${line.variant.productId}`} className="block truncate font-medium hover:underline">{line.variant.product.name}</Link>
                    <span className="font-mono text-[12px] text-muted">{line.variant.sku}</span>
                  </span>
                  <span className="w-28">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-[#f2f2f5]">
                      <span className={`block h-full rounded-full ${done ? "bg-ok" : "bg-accent"}`} style={{ width: `${Math.min(100, (line.receivedQty / Math.max(line.quantity, 1)) * 100)}%` }} />
                    </span>
                    <span className="mt-1 block text-right text-[12px] text-muted tabular-nums">{qty(line.receivedQty)} / {qty(line.quantity)}</span>
                  </span>
                  <span className="w-20 text-right text-muted tabular-nums">{money(line.unitCostCents)}</span>
                  <span className="w-24 text-right font-medium tabular-nums">{money(line.quantity * line.unitCostCents)}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between border-t border-line bg-subtle px-5 py-3 text-[13px] font-semibold">
            <span>{tx("Order value")}</span>
            <span className="tabular-nums">{money(total)}</span>
          </div>
        </Panel>
        <ActivityFeed entityType="purchase_order" entityId={order.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/purchase-orders/${order.id}`} />
      </DetailLayout>
    </div>
  );
}
