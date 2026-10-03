import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { centsToInput, daysFromToday, one, toDateInput } from "@/lib/format";
import { channels } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { createOrder } from "@/server/actions/orders";
import { getBalances } from "@/server/snapshot";
import { LineEditor } from "@/components/line-editor";
import { Banner, Field, PageIntro, Panel, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("New order") };
}

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  if (!can(session.role, "sales.write")) redirect("/sales-orders");
  const query = await searchParams;
  const [customers, warehouses, variants, balances] = await Promise.all([
    prisma.customer.findMany({ where: { organizationId: session.organization.id, status: "active" }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { organizationId: session.organization.id, active: true }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] }),
    prisma.productVariant.findMany({ where: { organizationId: session.organization.id, status: "active", product: { status: "active" } }, include: { product: true }, orderBy: { sku: "asc" } }),
    getBalances(session.organization.id),
  ]);
  const stock = new Map(balances.map((row) => [row.variantId, row.onHand]));
  void locale;
  return (
    <form action={createOrder}>
      <PageIntro
        back={{ href: "/sales-orders", label: tx("Orders") }}
        title={tx("New order")}
        actions={<SubmitButton>{tx("Create order")}</SubmitButton>}
      />
      <Banner error={one(query.error)} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title={tx("Lines")}>
          <LineEditor
            variants={variants.map((variant) => ({
              id: variant.id,
              sku: variant.sku,
              name: variant.name && variant.name !== "Standard" ? `${variant.product.name} · ${variant.name}` : variant.product.name,
              ean: variant.ean,
              amount: centsToInput(variant.priceCents),
              stock: stock.get(variant.id) ?? 0,
            }))}
          />
        </Panel>
        <Panel title={tx("Order")}>
          <div className="space-y-4">
            <Field label={tx("Customer")}>
              <select name="customerId" defaultValue={one(query.customer)} className={fieldClass}>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </Field>
            <Field label={tx("Channel")}>
              <select name="channel" defaultValue="shop" className={fieldClass}>
                {Object.entries(channels).map(([key, label]) => <option key={key} value={key}>{tx(label)}</option>)}
              </select>
            </Field>
            <Field label={tx("Promised date")}>
              <input name="promisedAt" type="date" defaultValue={toDateInput(daysFromToday(2))} className={fieldClass} />
            </Field>
            {warehouses.length > 1 ? (
              <Field label={tx("Ship from")}>
                <select name="warehouseId" className={fieldClass}>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </Field>
            ) : (
              <input type="hidden" name="warehouseId" value={warehouses[0]?.id ?? ""} />
            )}
            <Field label={tx("Reference")} hint={tx("Order number from the shop or marketplace")}>
              <input name="externalRef" placeholder={tx("optional")} className={`${fieldClass} font-mono`} />
            </Field>
          </div>
        </Panel>
      </div>
    </form>
  );
}
