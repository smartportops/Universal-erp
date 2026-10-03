import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { centsToInput, daysFromToday, one, toDateInput } from "@/lib/format";
import { getLocale, translator } from "@/lib/i18n-server";
import { createPurchaseOrder } from "@/server/actions/catalog";
import { getBalances, needsReorder, suggestedQty } from "@/server/snapshot";
import { LineEditor } from "@/components/line-editor";
import { Banner, Field, PageIntro, Panel, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("New purchase order") };
}

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  if (!can(session.role, "purchasing.write")) redirect("/purchase-orders");
  const query = await searchParams;
  const supplierId = one(query.supplier);
  const [suppliers, warehouses, variants, balances] = await Promise.all([
    prisma.supplier.findMany({ where: { organizationId: session.organization.id }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { organizationId: session.organization.id, active: true }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] }),
    prisma.productVariant.findMany({ where: { organizationId: session.organization.id }, include: { product: true }, orderBy: { sku: "asc" } }),
    getBalances(session.organization.id),
  ]);
  const supplier = suppliers.find((item) => item.id === supplierId) ?? suppliers[0];
  const stock = new Map(balances.map((row) => [row.variantId, row.onHand]));
  const suggested = variants
    .filter((variant) => supplierId && variant.preferredSupplierId === supplierId)
    .filter((variant) => {
      const balance = balances.find((row) => row.variantId === variant.id);
      return balance ? needsReorder(balance) : false;
    })
    .map((variant) => {
      const balance = balances.find((row) => row.variantId === variant.id)!;
      return { variantId: variant.id, quantity: suggestedQty(balance), amount: centsToInput(variant.costCents) };
    });

  return (
    <form action={createPurchaseOrder}>
      <PageIntro
        back={{ href: "/purchase-orders", label: tx("Purchase orders") }}
        title={tx("New purchase order")}
        description={suggested.length ? tx("{count} products below the reorder point are already filled in.", { count: suggested.length }) : tx("Starts as a draft. Ordering and receiving happen on the purchase order.")}
        actions={<SubmitButton>{tx("Create draft")}</SubmitButton>}
      />
      <Banner error={one(query.error)} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title={tx("Lines")}>
          {variants.length === 0 ? <p className="mb-3 text-[13px] text-muted">{tx("No products yet.")} <Link href="/products/new" className="text-ink underline-offset-2 hover:underline">{tx("Create product")}</Link></p> : null}
          <LineEditor
            amountLabel={tx("Unit cost")}
            initial={suggested}
            variants={variants.map((variant) => ({
              id: variant.id,
              sku: variant.sku,
              name: variant.name && variant.name !== "Standard" ? `${variant.product.name} · ${variant.name}` : variant.product.name,
              ean: variant.ean,
              amount: centsToInput(variant.costCents),
              stock: stock.get(variant.id) ?? 0,
            }))}
          />
        </Panel>
        <Panel title={tx("Purchase order")}>
          <div className="space-y-4">
            <Field label={tx("Supplier")}>
              {suppliers.length === 0 ? (
                <p className="text-[13px] text-muted">{tx("No suppliers yet.")} <Link href="/suppliers/new" className="text-ink underline-offset-2 hover:underline">{tx("Create supplier")}</Link></p>
              ) : (
                <select name="supplierId" defaultValue={supplier?.id} className={fieldClass}>
                  {suppliers.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.name} · ${item.code}` : item.name}</option>)}
                </select>
              )}
            </Field>
            <Field label={tx("Expected on")}>
              <input name="expectedAt" type="date" defaultValue={toDateInput(daysFromToday(supplier?.leadTimeDays ?? 14))} className={fieldClass} />
            </Field>
            {warehouses.length > 1 ? (
              <Field label={tx("Deliver to")}>
                <select name="warehouseId" className={fieldClass}>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </Field>
            ) : (
              <input type="hidden" name="warehouseId" value={warehouses[0]?.id ?? ""} />
            )}
          </div>
        </Panel>
      </div>
    </form>
  );
}
