import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { centsToInput, cn, dayKey, formatDay, money, one, qty, splitGross, todayKey, toDateInput } from "@/lib/format";
import { channels, dispositions, invoiceKinds, invoiceStatus, orderStatus, priorities, returnStatus, shipmentStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { deliverOrder, openReturn, pickOrder, shipOrder } from "@/server/actions/orders";
import { OrderActions } from "@/components/order-actions";
import { entityExtras } from "@/server/entity";
import { ActivityFeed, DetailLayout, EntityFields } from "@/components/entity-panel";
import { InlineEdit } from "@/components/inline-edit";
import { Banner, PageIntro, Panel, Pill, Properties, Status, Thumb, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const order = await prisma.salesOrder.findUnique({ where: { id } });
  return { title: order?.number ?? tx("Order") };
}

const carriers = ["DHL", "DPD", "GLS", "UPS", "Hermes", "Spedition"];

export default async function SalesOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const order = await prisma.salesOrder.findFirst({
    where: { id, organizationId: session.organization.id },
    include: {
      customer: true,
      warehouse: true,
      lines: { include: { variant: { include: { product: true } } } },
      shipments: { orderBy: { shippedAt: "asc" } },
      invoices: { include: { payments: true }, orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "desc" } },
      returns: true,
    },
  });
  if (!order) notFound();
  const extras = await entityExtras(session.organization.id, "sales_order", order.id);
  const open = ["confirmed", "picking", "partial"].includes(order.status);
  const late = !!order.promisedAt && open && dayKey(order.promisedAt) < todayKey();
  const fulfill = can(session.role, "fulfillment.write");
  const invoice = order.invoices.find((entry) => entry.kind === "invoice" && !["cancelled", "void"].includes(entry.status));
  const credited = invoice
    ? order.invoices.filter((entry) => entry.kind === "credit" && entry.correctsId === invoice.id && !["cancelled", "void"].includes(entry.status)).reduce((sum, entry) => sum + entry.totalCents, 0)
    : 0;
  const paid = invoice ? invoice.payments.filter((payment) => payment.status === "settled").reduce((sum, payment) => sum + payment.amountCents, 0) : 0;
  const openCents = invoice && ["issued", "partial"].includes(invoice.status) ? Math.max(invoice.totalCents - paid - credited, 0) : 0;
  const canInvoice = can(session.role, "finance.write") && !["cancelled", "completed"].includes(order.status) && !order.onHold && !invoice;
  const writable = can(session.role, "sales.write");

  const total = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  const tax = order.lines.reduce((sum, line) => sum + splitGross(line.quantity * line.unitPriceCents, line.taxRateBps).tax, 0);
  const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const shippedUnits = order.lines.reduce((sum, line) => sum + line.shippedQty, 0);

  const cancelled = order.status === "cancelled";
  const steps = [
    { label: tx("Confirmed"), done: !cancelled },
    { label: tx("Picked"), done: ["picking", "partial", "shipped", "delivered"].includes(order.status) },
    { label: order.status === "partial" ? tx("Shipped {shipped}/{units}", { shipped: shippedUnits, units }) : tx("Shipped"), done: ["shipped", "delivered"].includes(order.status), partial: order.status === "partial" },
    { label: tx("Delivered"), done: order.status === "delivered" },
    { label: tx("Invoiced"), done: !!invoice },
    { label: tx("Paid"), done: invoice?.status === "paid", partial: invoice?.status === "partial" },
  ];
  void locale;

  return (
    <div>
      <PageIntro
        back={{ href: "/sales-orders", label: tx("Orders") }}
        eyebrow={
          <span>
            <Link href={`/customers/${order.customerId}`} className="hover:text-ink hover:underline">{order.customer.name}</Link>
            <span className="text-faint"> · {tx(channels[order.channel] ?? order.channel)} · {formatDay(order.orderedAt)}</span>
          </span>
        }
        title={order.number}
        badges={
          <>
            <Status map={txMap(orderStatus, tx)} value={order.status} />
            {order.onHold ? <Pill tone="warning">{tx("On hold")}</Pill> : null}
            {order.priority !== "normal" ? <Pill tone={order.priority === "urgent" || order.priority === "high" ? "danger" : "neutral"}>{tx(priorities[order.priority] ?? order.priority)}</Pill> : null}
            {late ? <Pill tone="danger">{tx("Late")}</Pill> : null}
          </>
        }
        actions={
          <>
            {fulfill && order.status === "confirmed" && !order.onHold ? (
              <form action={pickOrder}><input type="hidden" name="id" value={order.id} /><SubmitButton variant="secondary">{tx("Pick")}</SubmitButton></form>
            ) : null}
            {fulfill && order.status === "shipped" ? (
              <form action={deliverOrder}><input type="hidden" name="id" value={order.id} /><SubmitButton variant="secondary">{tx("Mark as delivered")}</SubmitButton></form>
            ) : null}
            <OrderActions
              id={order.id}
              status={order.status}
              priority={order.priority}
              onHold={order.onHold}
              canSales={writable}
              canFinance={can(session.role, "finance.write")}
              canInvoice={canInvoice}
              invoice={invoice ? { id: invoice.id, number: invoice.number, openCents, openInput: centsToInput(openCents) } : null}
            />
          </>
        }
      />
      <Banner error={one(query.error) ? tx(one(query.error)) : undefined} notice={one(query.notice) ? tx(one(query.notice)) : undefined} />

      {!cancelled ? (
        <ol className="mb-5 grid grid-cols-3 gap-y-3 rounded-xl bg-surface px-5 py-4 shadow-[var(--shadow)] sm:grid-cols-6">
          {steps.map((step, index) => (
            <li key={index} className="flex items-center gap-2 text-[13px]">
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  step.done ? "bg-ok text-white" : step.partial ? "bg-warning-soft text-warning ring-1 ring-warning/30" : "bg-[#f2f2f5] text-faint",
                )}
              >
                {step.done ? <Check size={12} strokeWidth={3} /> : index + 1}
              </span>
              <span className={step.done ? "font-medium" : step.partial ? "font-medium text-warning" : "text-muted"}>{step.label}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <DetailLayout
        side={
          <>
            <Panel title={tx("Customer")}>
              <Link href={`/customers/${order.customerId}`} className="flex items-center gap-3 rounded-lg hover:opacity-80">
                <Thumb label={order.customer.name} size={34} className="rounded-full" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{order.customer.name}</span>
                  <span className="block truncate text-[12px] text-muted">{order.customer.email || order.customer.city}</span>
                </span>
              </Link>
            </Panel>
            <Panel title={tx("Details")}>
              <Properties
                items={[
                  { label: tx("Warehouse"), value: order.warehouse.name },
                  {
                    label: tx("Promised"),
                    value: (
                      <InlineEdit
                        entity="sales_order"
                        id={order.id}
                        field="promisedAt"
                        type="date"
                        value={toDateInput(order.promisedAt)}
                        display={<span className={late ? "font-medium text-danger" : ""}>{formatDay(order.promisedAt)}</span>}
                        disabled={!writable || !open}
                        placeholder={tx("Set date")}
                      />
                    ),
                  },
                  { label: tx("Reference"), value: <InlineEdit entity="sales_order" id={order.id} field="externalRef" value={order.externalRef} disabled={!writable} placeholder={tx("Shop number")} mono /> },
                ]}
              />
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1 text-[13px] text-muted">{tx("Notes")}</div>
                <InlineEdit entity="sales_order" id={order.id} field="notes" type="textarea" value={order.notes} disabled={!writable} placeholder={tx("Internal note")} />
              </div>
            </Panel>
            {order.shipments.length || order.returns.length || order.invoices.length || order.quotes.length ? (
              <Panel title={tx("Documents")} flush>
                <ul className="pb-1">
                  {order.shipments.map((shipment) => (
                    <li key={shipment.id}>
                      <Link href={`/shipments/${shipment.id}`} className="flex items-center justify-between gap-2 px-5 py-2 text-[13px] hover:bg-subtle">
                        <span><span className="font-medium">{shipment.number}</span><span className="ml-2 text-muted">{shipment.carrier === "Spedition" ? tx("Freight") : shipment.carrier}</span></span>
                        <Status map={txMap(shipmentStatus, tx)} value={shipment.status} />
                      </Link>
                    </li>
                  ))}
                  {order.invoices.map((entry) => (
                    <li key={entry.id}>
                      <Link href={`/invoices/${entry.id}`} className="flex items-center justify-between gap-2 px-5 py-2 text-[13px] hover:bg-subtle">
                        <span><span className="font-medium">{entry.number}</span><span className="ml-2 text-muted">{tx(invoiceKinds[entry.kind] ?? entry.kind)}</span></span>
                        <Status map={txMap(invoiceStatus, tx)} value={entry.status} />
                      </Link>
                    </li>
                  ))}
                  {order.quotes.map((entry) => (
                    <li key={entry.id}>
                      <Link href={`/quotes/${entry.id}`} className="flex items-center justify-between gap-2 px-5 py-2 text-[13px] hover:bg-subtle">
                        <span className="font-medium">{entry.number}</span>
                        <span className="text-muted">{tx("Quote")}</span>
                      </Link>
                    </li>
                  ))}
                  {order.returns.map((entry) => (
                    <li key={entry.id}>
                      <Link href={`/returns/${entry.id}`} className="flex items-center justify-between gap-2 px-5 py-2 text-[13px] hover:bg-subtle">
                        <span className="font-medium">{entry.number}</span>
                        <Status map={txMap(returnStatus, tx)} value={entry.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
            <EntityFields entityType="sales_order" entityId={order.id} fields={extras.fields} files={extras.files} canEdit={can(session.role, "comments.write")} returnTo={`/sales-orders/${order.id}`} />
          </>
        }
      >
        <Panel title={tx("Lines")} flush>
          <ul>
            {order.lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 border-t border-line px-5 py-3 text-[13px]">
                <Thumb label={line.variant.product.name} size={36} />
                <span className="min-w-0 flex-1">
                  <Link href={`/products/${line.variant.productId}`} className="block truncate font-medium hover:underline">{line.variant.product.name}</Link>
                  <span className="font-mono text-[12px] text-muted">{line.variant.sku}</span>
                  {line.variant.name && line.variant.name !== "Standard" ? <span className="ml-2 text-[12px] text-muted">{line.variant.name}</span> : null}
                </span>
                <span className="w-24 text-right text-muted tabular-nums">{money(line.unitPriceCents)} · {qty(line.quantity)}</span>
                <span className="w-20 text-right text-[12px] tabular-nums">
                  {line.shippedQty >= line.quantity ? <span className="text-ok">{tx("shipped")}</span> : line.shippedQty > 0 ? <span className="text-warning">{tx("{shipped} of {quantity}", { shipped: line.shippedQty, quantity: line.quantity })}</span> : <span className="text-faint">{tx("not shipped")}</span>}
                </span>
                <span className="w-24 text-right font-medium tabular-nums">{money(line.quantity * line.unitPriceCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-line bg-subtle px-5 py-3 text-[13px]">
            <div className="flex justify-between text-muted"><dt>{tx("Net")}</dt><dd className="tabular-nums">{money(total - tax)}</dd></div>
            <div className="flex justify-between text-muted"><dt>{tx("Tax")}</dt><dd className="tabular-nums">{money(tax)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>{tx("Grand total")}</dt><dd className="tabular-nums">{money(total)}</dd></div>
          </dl>
        </Panel>

        {fulfill && open && !order.onHold ? (
          <Panel title={tx("Ship")} description={order.status === "partial" ? tx("Ships all lines that are still open.") : tx("Posts the goods issue and creates the shipment.")}>
            <form action={shipOrder} className="grid gap-2 sm:grid-cols-[150px_1fr_auto]">
              <input type="hidden" name="id" value={order.id} />
              <select name="carrier" defaultValue="DHL" className={fieldClass}>
                {carriers.map((carrier) => <option key={carrier} value={carrier}>{carrier === "Spedition" ? tx("Freight") : carrier}</option>)}
              </select>
              <input name="trackingNumber" placeholder={tx("Tracking number (optional)")} className={`${fieldClass} font-mono`} />
              <SubmitButton>{tx("Ship")}</SubmitButton>
            </form>
          </Panel>
        ) : null}

        <ActivityFeed entityType="sales_order" entityId={order.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/sales-orders/${order.id}`} />

        {fulfill && shippedUnits > 0 ? (
          <Panel title={tx("Return")}>
            <form action={openReturn} className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
              <input type="hidden" name="id" value={order.id} />
              <input name="reason" required placeholder={tx("Return reason, e.g. the size does not fit")} className={fieldClass} />
              <select name="disposition" className={fieldClass}>
                {Object.entries(dispositions).map(([key, label]) => <option key={key} value={key}>{tx(label)}</option>)}
              </select>
              <SubmitButton variant="secondary">{tx("Create return")}</SubmitButton>
            </form>
          </Panel>
        ) : null}
      </DetailLayout>
    </div>
  );
}
