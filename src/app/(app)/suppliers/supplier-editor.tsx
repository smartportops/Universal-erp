import type { PurchaseOrder, PurchaseOrderLine, Supplier, SupplierBankAccount, SupplierContact } from "@prisma/client";
import { can } from "@/lib/permissions";
import type { SessionContext } from "@/lib/auth";
import { formatDay, money, qty } from "@/lib/format";
import { purchaseStatus } from "@/lib/labels";
import { txMap } from "@/lib/i18n";
import { translator } from "@/lib/i18n-server";
import { entityExtras } from "@/server/entity";
import { getBalances } from "@/server/snapshot";
import { createSupplier, saveSupplier } from "@/server/actions/catalog";
import { ActivityFeed, DetailLayout, EntityFields } from "@/components/entity-panel";
import { SaveSupplierButton, SupplierBanks, SupplierContacts, SupplierDraftNotice, SupplierDraftProvider, SupplierField } from "@/components/supplier-draft";
import { Banner, Button, DataTable, PageIntro, Panel, Properties, Status, Thumb } from "@/components/ui";

export type SupplierWithRelations = Supplier & {
  contacts: SupplierContact[];
  bankAccounts: SupplierBankAccount[];
  purchaseOrders: (PurchaseOrder & { lines: PurchaseOrderLine[] })[];
};

const languages = [
  ["de", "German"],
  ["en", "English"],
  ["fr", "French"],
  ["nl", "Dutch"],
  ["it", "Italian"],
  ["es", "Spanish"],
  ["pl", "Polish"],
] as const;

const currencies = ["EUR", "CHF", "GBP", "USD", "PLN", "SEK"];

const keys = ["name", "code", "customerNumber", "email", "phone", "website", "street", "postalCode", "city", "country", "language", "currency", "vatId", "taxNumber", "notes", "leadTimeDays", "paymentTerms"] as const;

export async function SupplierEditor({
  supplier,
  session,
  error,
  notice,
}: {
  supplier: SupplierWithRelations | null;
  session: SessionContext;
  error?: string;
  notice?: string;
}) {
  const tx = await translator();
  const creating = supplier === null;
  const id = supplier?.id ?? "new";
  const writable = can(session.role, "purchasing.write");
  const [extras, balances] = supplier
    ? await Promise.all([entityExtras(session.organization.id, "supplier", supplier.id), getBalances(session.organization.id)])
    : [null, []];
  const products = supplier ? balances.filter((row) => row.supplierId === supplier.id) : [];
  const blank = "";
  const initial: Record<string, string> = Object.fromEntries(
    keys.map((key) => [key, supplier ? String(supplier[key] ?? "") : key === "leadTimeDays" ? blank : blank]),
  );
  const field = (key: (typeof keys)[number], extra?: { type?: "text" | "number" | "textarea" | "select"; options?: { value: string; label: string }[]; placeholder?: string }) => (
    <SupplierField k={key} entity="supplier" id={id} field={key} disabled={!writable} placeholder={extra?.placeholder ?? tx("Add")} type={extra?.type} options={extra?.options} />
  );
  const choice = (rows: { value: string; label: string }[]) => [{ value: "", label: "-" }, ...rows];

  return (
    <SupplierDraftProvider
      key={supplier ? `${supplier.id}:${supplier.updatedAt.toISOString()}` : "new"}
      mode={creating ? "create" : "edit"}
      initial={initial}
      contacts={(supplier?.contacts ?? []).map((row) => ({ id: row.id, name: row.name, role: row.role, email: row.email, phone: row.phone }))}
      banks={(supplier?.bankAccounts ?? []).map((row) => ({ id: row.id, accountHolder: row.accountHolder, iban: row.iban, bic: row.bic, bankName: row.bankName }))}
      create={creating ? createSupplier : undefined}
      save={supplier ? saveSupplier.bind(null, supplier.id) : undefined}
    >
      <div>
        <PageIntro
          back={{ href: "/suppliers", label: tx("Suppliers") }}
          thumb={supplier ? <Thumb label={supplier.name} size={44} /> : undefined}
          eyebrow={supplier?.code ?? tx("New supplier")}
          title={
            <SupplierField
              k="name"
              entity="supplier"
              id={id}
              field="name"
              disabled={!writable}
              placeholder={tx("Company")}
              autoFocus={creating}
              plain
              textClassName="text-[22px] font-semibold tracking-[-0.02em]"
              className={creating ? "min-w-[320px]" : undefined}
            />
          }
          actions={
            writable ? (
              <>
                {supplier ? <Button href={`/purchase-orders/new?supplier=${supplier.id}`} variant="secondary">{tx("New purchase order")}</Button> : null}
                <SaveSupplierButton />
              </>
            ) : null
          }
        />
        <Banner error={error} notice={notice} />
        <SupplierDraftNotice />
        <DetailLayout
          side={
            <>
              <Panel title={tx("Contact")}>
                <Properties
                  items={[
                    { label: tx("Email"), value: field("email") },
                    { label: tx("Phone"), value: field("phone") },
                    { label: tx("Website"), value: field("website") },
                  ]}
                />
              </Panel>
              <Panel title={tx("Address")}>
                <Properties
                  items={[
                    { label: tx("Street"), value: field("street") },
                    { label: tx("Postal code"), value: field("postalCode") },
                    { label: tx("City"), value: field("city") },
                    { label: tx("Country"), value: field("country", { placeholder: "DE" }) },
                  ]}
                />
              </Panel>
              <Panel title={tx("Tax and terms")}>
                <Properties
                  items={[
                    { label: tx("Supplier number"), value: field("code", { placeholder: tx("Assigned when you create") }) },
                    { label: tx("Our customer number"), value: field("customerNumber") },
                    { label: tx("VAT ID"), value: field("vatId") },
                    { label: tx("Tax number"), value: field("taxNumber") },
                    { label: tx("Language"), value: field("language", { type: "select", options: choice(languages.map(([value, label]) => ({ value, label: tx(label) }))) }) },
                    { label: tx("Currency"), value: field("currency", { type: "select", options: choice(currencies.map((value) => ({ value, label: value }))) }) },
                    { label: tx("Lead time"), value: field("leadTimeDays", { type: "number", placeholder: "14" }) },
                    { label: tx("Payment terms"), value: field("paymentTerms") },
                  ]}
                />
              </Panel>
              {supplier && extras ? (
                <EntityFields entityType="supplier" entityId={supplier.id} fields={extras.fields} files={extras.files} canEdit={can(session.role, "comments.write")} returnTo={`/suppliers/${supplier.id}`} />
              ) : null}
            </>
          }
        >
          <Panel title={tx("Contacts")} description={tx("People you order from at this supplier.")}>
            <SupplierContacts />
          </Panel>
          <Panel title={tx("Bank accounts")}>
            <SupplierBanks />
          </Panel>
          <Panel title={tx("Internal notes")}>
            {field("notes", { type: "textarea", placeholder: tx("Only visible to your team.") })}
          </Panel>
          <Panel title={tx("Purchase orders")} flush>
            <DataTable
              columns={[{ label: tx("Purchase order") }, { label: tx("Expected") }, { label: tx("Status") }, { label: tx("Value"), align: "right" }]}
              rows={(supplier?.purchaseOrders ?? []).map((order) => ({
                key: order.id,
                href: `/purchase-orders/${order.id}`,
                cells: [
                  order.number,
                  formatDay(order.expectedAt),
                  <Status key="s" map={txMap(purchaseStatus, tx)} value={order.status} />,
                  money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0)),
                ],
              }))}
              empty={{ title: tx("No purchase orders"), body: creating ? tx("Create the supplier first, then add purchase orders.") : tx("Nothing is open with this supplier.") }}
            />
          </Panel>
          {products.length ? (
            <Panel title={tx("Items")} flush>
              <DataTable
                columns={[{ label: tx("Product") }, { label: tx("SKU") }, { label: tx("On hand"), align: "right" }, { label: tx("Incoming"), align: "right" }]}
                rows={products.map((row) => ({
                  key: row.variantId,
                  href: `/products/${row.productId}`,
                  cells: [row.productName, <span key="sku" className="font-mono text-[12px]">{row.sku}</span>, <span key="q" className={row.onHand < 0 ? "text-danger" : ""}>{qty(row.onHand)}</span>, qty(row.incoming)],
                }))}
              />
            </Panel>
          ) : null}
          {supplier && extras ? (
            <ActivityFeed entityType="supplier" entityId={supplier.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/suppliers/${supplier.id}`} />
          ) : (
            <Panel title={tx("Activity")}>
              <p className="text-[13px] text-muted">{tx("No entries yet.")}</p>
            </Panel>
          )}
        </DetailLayout>
      </div>
    </SupplierDraftProvider>
  );
}
