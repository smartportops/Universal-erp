import type { Customer, Invoice, Payment, SalesOrder, SalesOrderLine } from "@prisma/client";
import { can } from "@/lib/permissions";
import type { SessionContext } from "@/lib/auth";
import { formatDay, money } from "@/lib/format";
import { signedInvoiceNet } from "@/lib/invoices";
import { channels, customerTypes, invoiceStatus, orderStatus } from "@/lib/labels";
import { translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { entityExtras } from "@/server/entity";
import { createCustomer, saveCustomer } from "@/server/actions/catalog";
import { ActivityFeed, DetailLayout, EntityFields } from "@/components/entity-panel";
import { RecordDraftNotice, RecordDraftProvider, RecordField, SaveRecordButton } from "@/components/record-draft";
import { Banner, Button, DataTable, PageIntro, Panel, Properties, Stat, Status, Thumb } from "@/components/ui";

export type CustomerWithRelations = Customer & {
  salesOrders: (SalesOrder & { lines: SalesOrderLine[] })[];
  invoices: (Invoice & { payments: Payment[] })[];
};

export const customerDraftKeys = ["name", "email", "phone", "company", "type", "street", "addressLine2", "postalCode", "city", "country", "paymentTerms", "vatId", "taxNumber", "notes"] as const;

export async function CustomerEditor({
  customer,
  session,
  error,
  notice,
}: {
  customer: CustomerWithRelations | null;
  session: SessionContext;
  error?: string;
  notice?: string;
}) {
  const tx = await translator();
  const creating = customer === null;
  const id = customer?.id ?? "new";
  const writable = can(session.role, "sales.write");
  const extras = customer ? await entityExtras(session.organization.id, "customer", customer.id) : null;

  const initial: Record<string, string> = Object.fromEntries(
    customerDraftKeys.map((key) => [key, customer ? String(customer[key] ?? "") : key === "type" ? "b2c" : key === "country" ? "DE" : ""]),
  );

  const paidOf = (invoice: CustomerWithRelations["invoices"][number]) =>
    invoice.payments.filter((payment) => payment.status === "settled").reduce((sum, payment) => sum + payment.amountCents, 0);
  const invoices = customer?.invoices ?? [];
  const orders = customer?.salesOrders ?? [];
  const open = invoices.filter((invoice) => ["issued", "partial"].includes(invoice.status)).reduce((sum, invoice) => sum + invoice.totalCents - paidOf(invoice), 0);
  const revenue = invoices.reduce((sum, invoice) => sum + signedInvoiceNet(invoice), 0);

  const field = (key: (typeof customerDraftKeys)[number], placeholder?: string, extra?: { type?: "text" | "textarea" | "select"; options?: { value: string; label: string }[] }) => (
    <RecordField k={key} entity="customer" id={id} field={key} disabled={!writable} placeholder={placeholder ?? tx("Add")} type={extra?.type} options={extra?.options} />
  );

  const saveBound = customer ? saveCustomer.bind(null, customer.id) : undefined;

  return (
    <RecordDraftProvider key={customer ? `${customer.id}:${customer.updatedAt.toISOString()}` : "new"} mode={creating ? "create" : "edit"} initial={initial} create={creating ? createCustomer : undefined} save={saveBound}>
      <div>
        <PageIntro
          back={{ href: "/customers", label: tx("Customers") }}
          thumb={customer ? <Thumb label={customer.name} size={44} className="rounded-full" /> : undefined}
          eyebrow={customer?.code ?? tx("New customer")}
          title={
            <RecordField
              k="name"
              entity="customer"
              id={id}
              field="name"
              disabled={!writable}
              placeholder={tx("Customer name")}
              autoFocus={creating}
              plain
              textClassName="text-[22px] font-semibold tracking-[-0.02em]"
              className={creating ? "min-w-[320px]" : undefined}
            />
          }
          actions={
            writable ? (
              <>
                {customer ? <Button href={`/sales-orders/new?customer=${customer.id}`} variant="secondary">{tx("New order")}</Button> : null}
                <SaveRecordButton />
              </>
            ) : null
          }
        />
        <Banner error={error} notice={notice} />
        <RecordDraftNotice />
        <DetailLayout
          side={
            <>
              <Panel title={tx("Contact")}>
                <Properties
                  items={[
                    { label: tx("Email"), value: field("email") },
                    { label: tx("Phone"), value: field("phone") },
                    { label: tx("Company"), value: field("company") },
                    {
                      label: tx("Type"),
                      value: field("type", undefined, { type: "select", options: Object.entries(customerTypes).map(([value, label]) => ({ value, label: tx(label) })) }),
                    },
                  ]}
                />
              </Panel>
              <Panel title={tx("Address")}>
                <Properties
                  items={[
                    { label: tx("Street"), value: field("street") },
                    { label: tx("Address line 2"), value: field("addressLine2") },
                    { label: tx("Postal code"), value: field("postalCode") },
                    { label: tx("City"), value: field("city") },
                    { label: tx("Country"), value: field("country", "DE") },
                  ]}
                />
              </Panel>
              <Panel title={tx("Tax and terms")}>
                <Properties
                  items={[
                    { label: tx("VAT ID"), value: field("vatId") },
                    { label: tx("Tax number"), value: field("taxNumber") },
                    { label: tx("Payment terms"), value: field("paymentTerms") },
                  ]}
                />
              </Panel>
              {customer && extras ? (
                <EntityFields entityType="customer" entityId={customer.id} fields={extras.fields} files={extras.files} canEdit={can(session.role, "comments.write")} returnTo={`/customers/${customer.id}`} />
              ) : null}
            </>
          }
        >
          {customer ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label={tx("Net revenue")} value={money(revenue)} />
              <Stat label={tx("Orders")} value={String(orders.length)} />
              <Stat label={tx("Open receivables")} value={money(open)} tone={open > 0 ? "warning" : undefined} />
            </div>
          ) : null}
          <Panel title={tx("Notes")}>
            {field("notes", tx("Write a note about this customer…"), { type: "textarea" })}
          </Panel>
          <Panel title={tx("Orders")} flush>
            <DataTable
              columns={[{ label: tx("Order") }, { label: tx("Date") }, { label: tx("Channel") }, { label: tx("Status") }, { label: tx("Total"), align: "right" }]}
              rows={orders.map((order) => ({
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
              empty={{ title: tx("No orders yet"), body: creating ? tx("Create the customer first, then add orders.") : tx("Create the first order for this customer.") }}
            />
          </Panel>
          {invoices.length ? (
            <Panel title={tx("Invoices")} flush>
              <DataTable
                columns={[{ label: tx("Invoice") }, { label: tx("Due") }, { label: tx("Status") }, { label: tx("Open"), align: "right" }]}
                rows={invoices.map((invoice) => ({
                  key: invoice.id,
                  href: `/invoices/${invoice.id}`,
                  cells: [invoice.number, formatDay(invoice.dueAt), <Status key="s" map={txMap(invoiceStatus, tx)} value={invoice.status} />, money(Math.max(invoice.totalCents - paidOf(invoice), 0))],
                }))}
              />
            </Panel>
          ) : null}
          {customer && extras ? (
            <ActivityFeed entityType="customer" entityId={customer.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/customers/${customer.id}`} />
          ) : (
            <Panel title={tx("Activity")}>
              <p className="text-[13px] text-muted">{tx("No entries yet.")}</p>
            </Panel>
          )}
        </DetailLayout>
      </div>
    </RecordDraftProvider>
  );
}
