import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDay, money, one } from "@/lib/format";
import { channels, customerTypes, invoiceStatus, orderStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { entityExtras } from "@/server/entity";
import { ActivityFeed, DetailLayout, EntityFields } from "@/components/entity-panel";
import { InlineEdit } from "@/components/inline-edit";
import { Banner, Button, DataTable, PageIntro, Panel, Properties, Stat, Status, Thumb } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  return { title: customer?.name ?? tx("Customer") };
}

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: session.organization.id },
    include: {
      salesOrders: { orderBy: { orderedAt: "desc" }, take: 10, include: { lines: true } },
      invoices: { include: { payments: true }, orderBy: { issuedAt: "desc" } },
    },
  });
  if (!customer) notFound();
  const paidOf = (invoice: (typeof customer.invoices)[number]) =>
    invoice.payments.filter((payment) => payment.status === "settled").reduce((sum, payment) => sum + payment.amountCents, 0);
  const open = customer.invoices.filter((invoice) => ["issued", "partial"].includes(invoice.status)).reduce((sum, invoice) => sum + invoice.totalCents - paidOf(invoice), 0);
  const revenue = customer.invoices.filter((invoice) => invoice.status !== "void").reduce((sum, invoice) => sum + invoice.netCents, 0);
  const extras = await entityExtras(session.organization.id, "customer", customer.id);
  const writable = can(session.role, "sales.write");
  const edit = (field: string, value: string, placeholder?: string) => (
    <InlineEdit entity="customer" id={customer.id} field={field} value={value} disabled={!writable} placeholder={placeholder ?? tx("Add")} />
  );
  void locale;

  return (
    <div>
      <PageIntro
        back={{ href: "/customers", label: tx("Customers") }}
        thumb={<Thumb label={customer.name} size={44} className="rounded-full" />}
        eyebrow={customer.code}
        title={<InlineEdit entity="customer" id={customer.id} field="name" value={customer.name} disabled={!writable} textClassName="text-[22px] font-semibold tracking-[-0.02em]" />}
        actions={writable ? <Button href={`/sales-orders/new?customer=${customer.id}`}>{tx("New order")}</Button> : null}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <DetailLayout
        side={
          <>
            <Panel title={tx("Contact")}>
              <Properties
                items={[
                  { label: tx("Email"), value: edit("email", customer.email) },
                  {
                    label: tx("Type"),
                    value: (
                      <InlineEdit
                        entity="customer"
                        id={customer.id}
                        field="type"
                        type="select"
                        value={customer.type}
                        disabled={!writable}
                        options={Object.entries(customerTypes).map(([value, label]) => ({ value, label: tx(label) }))}
                      />
                    ),
                  },
                  { label: tx("City"), value: edit("city", customer.city) },
                  { label: tx("Country"), value: edit("country", customer.country) },
                  { label: tx("Payment terms"), value: edit("paymentTerms", customer.paymentTerms) },
                  { label: tx("VAT ID"), value: edit("vatId", customer.vatId) },
                ]}
              />
            </Panel>
            <EntityFields entityId={customer.id} fields={extras.fields} files={extras.files} canEdit={can(session.role, "comments.write")} />
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={tx("Net revenue")} value={money(revenue)} />
          <Stat label={tx("Orders")} value={String(customer.salesOrders.length)} />
          <Stat label={tx("Open receivables")} value={money(open)} tone={open > 0 ? "warning" : undefined} />
        </div>
        <Panel title={tx("Orders")} flush>
          <DataTable
            columns={[{ label: tx("Order") }, { label: tx("Date") }, { label: tx("Channel") }, { label: tx("Status") }, { label: tx("Total"), align: "right" }]}
            rows={customer.salesOrders.map((order) => ({
              key: order.id,
              href: `/sales-orders/${order.id}`,
              cells: [
                order.number,
                formatDay(order.orderedAt),
                tx(channels[order.channel] ?? order.channel),
                <Status key="s" map={txMap(orderStatus, tx)} value={order.status} />,
                money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0)),
              ],
            }))}
            empty={{ title: tx("No orders yet"), body: tx("Create the first order for this customer.") }}
          />
        </Panel>
        {customer.invoices.length ? (
          <Panel title={tx("Invoices")} flush>
            <DataTable
              columns={[{ label: tx("Invoice") }, { label: tx("Due") }, { label: tx("Status") }, { label: tx("Open"), align: "right" }]}
              rows={customer.invoices.map((invoice) => ({
                key: invoice.id,
                href: `/invoices/${invoice.id}`,
                cells: [invoice.number, formatDay(invoice.dueAt), <Status key="s" map={txMap(invoiceStatus, tx)} value={invoice.status} />, money(Math.max(invoice.totalCents - paidOf(invoice), 0))],
              }))}
            />
          </Panel>
        ) : null}
        <ActivityFeed entityType="customer" entityId={customer.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/customers/${customer.id}`} />
      </DetailLayout>
    </div>
  );
}
