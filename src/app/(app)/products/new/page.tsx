import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { money, qty } from "@/lib/format";
import { productStatus } from "@/lib/labels";
import { translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { DraftDescription, DraftField, DraftMedia, DraftNotice, DraftStatus, DraftSuppliers, DraftToggle, ProductDraftProvider, SaveProductButton } from "@/components/product-draft";
import { DetailLayout } from "@/components/entity-panel";
import { PageIntro, Panel, Properties } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("New product") };
}

const cell = "px-3 py-2";
const variantId = "new";

export default async function NewProductPage() {
  const tx = await translator();
  const session = await requireUser();
  if (!can(session.role, "catalog.write")) redirect("/products");
  const [taxRates, suppliers] = await Promise.all([
    prisma.taxRate.findMany({ where: { organizationId: session.organization.id }, orderBy: { rateBps: "desc" } }),
    prisma.supplier.findMany({ where: { organizationId: session.organization.id, status: "active" }, orderBy: { name: "asc" } }),
  ]);
  const draft: Record<string, string> = {
    "product:name": "",
    "product:status": "draft",
    "product:category": "",
    "product:taxRateId": "",
    "product:description": "",
    "product:allowOversell": "false",
    "product:trackSerialsIn": "false",
    "product:trackSerialsOut": "false",
    [`variant:${variantId}:name`]: "",
    [`variant:${variantId}:sku`]: "",
    [`variant:${variantId}:ean`]: "",
    [`variant:${variantId}:price`]: "0,00",
    [`variant:${variantId}:cost`]: "0,00",
    [`variant:${variantId}:weight`]: "0",
    [`variant:${variantId}:reorder`]: "0",
  };

  return (
    <ProductDraftProvider mode="create" productId={variantId} variantIds={[variantId]} initial={draft}>
      <div>
        <PageIntro
          back={{ href: "/products", label: tx("Products") }}
          title={<DraftField k="product:name" entity="product" id={variantId} field="name" placeholder="Product title" autoFocus textClassName="text-[22px] font-semibold tracking-[-0.02em]" className="min-w-[320px]" />}
          badges={<DraftStatus map={txMap(productStatus, tx)} />}
          actions={<SaveProductButton />}
        />
        <DraftNotice />
        <DetailLayout
          side={
            <Panel title={tx("Details")}>
              <Properties
                items={[
                  {
                    label: tx("Status"),
                    value: (
                      <DraftField
                        k="product:status"
                        entity="product"
                        id={variantId}
                        field="status"
                        type="select"
                        options={Object.entries(productStatus).map(([value, item]) => ({ value, label: tx(item.label) }))}
                      />
                    ),
                  },
                  { label: tx("Category"), value: <DraftField k="product:category" entity="product" id={variantId} field="category" placeholder={tx("Set category")} /> },
                  {
                    label: tx("Tax rate"),
                    value: (
                      <DraftField
                        k="product:taxRateId"
                        entity="product"
                        id={variantId}
                        field="taxRateId"
                        type="select"
                        options={[{ value: "", label: tx("Default") }, ...taxRates.map((rate) => ({ value: rate.id, label: `${rate.name} (${rate.rateBps / 100} %)` }))]}
                      />
                    ),
                  },
                  { label: tx("Stock"), value: <span className="font-medium">{qty(0)}</span> },
                  { label: tx("Incoming"), value: qty(0) },
                ]}
              />
              <DraftSuppliers options={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))} />
              <div className="mt-3 border-t border-line pt-2">
                <DraftToggle k="product:allowOversell" label={tx("Allow overselling")} hint={tx("Orders may exceed stock")} />
                <DraftToggle k="product:trackSerialsIn" label={tx("Serial numbers on receipt")} hint={tx("Ask for serials when goods arrive")} />
                <DraftToggle k="product:trackSerialsOut" label={tx("Serial numbers on dispatch")} hint={tx("Ask for serials when shipping")} />
              </div>
            </Panel>
          }
        >
          <Panel title={tx("Media")} flush>
            <DraftMedia />
          </Panel>
          <Panel title={tx("Description")}>
            <DraftDescription />
          </Panel>
          <Panel title={tx("Variants")} description={tx("Click a value to edit it directly.")} flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-[13px]">
                <thead>
                  <tr className="border-y border-line bg-subtle text-left text-[12px] text-muted">
                    <th className="py-2 pl-5 pr-3 font-medium">{tx("Variant")}</th>
                    <th className="px-3 py-2 font-medium">{tx("SKU")}</th>
                    <th className="px-3 py-2 font-medium">{tx("EAN")}</th>
                    <th className="px-3 py-2 text-right font-medium">{tx("Price")}</th>
                    <th className="px-3 py-2 text-right font-medium">{tx("Cost")}</th>
                    <th className="px-3 py-2 text-right font-medium">{tx("Weight (g)")}</th>
                    <th className="px-3 py-2 text-right font-medium">{tx("Reorder point")}</th>
                    <th className="py-2 pl-3 pr-5 text-right font-medium">{tx("Stock")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={`${cell} pl-5`}><DraftField k={`variant:${variantId}:name`} entity="variant" id={variantId} field="name" placeholder="Standard" /></td>
                    <td className={cell}><DraftField k={`variant:${variantId}:sku`} entity="variant" id={variantId} field="sku" mono placeholder="SKU" /></td>
                    <td className={cell}><DraftField k={`variant:${variantId}:ean`} entity="variant" id={variantId} field="ean" mono placeholder={tx("EAN")} /></td>
                    <td className={cell}><DraftField k={`variant:${variantId}:price`} entity="variant" id={variantId} field="price" type="money" display={money(0)} align="right" /></td>
                    <td className={cell}><DraftField k={`variant:${variantId}:cost`} entity="variant" id={variantId} field="cost" type="money" display={money(0)} align="right" /></td>
                    <td className={cell}><DraftField k={`variant:${variantId}:weight`} entity="variant" id={variantId} field="weight" type="number" align="right" placeholder="0" /></td>
                    <td className={cell}><DraftField k={`variant:${variantId}:reorder`} entity="variant" id={variantId} field="reorder" type="number" align="right" /></td>
                    <td className="py-2 pl-3 pr-5 text-right font-medium tabular-nums">{qty(0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title={tx("Stock movements")} action={<Link href="/stock" className="text-[13px] text-muted hover:text-ink">{tx("All")}</Link>}>
            <p className="text-[13px] text-muted">{tx("No movements yet.")}</p>
          </Panel>
          <Panel title={tx("Activity")}>
            <p className="text-[13px] text-muted">{tx("No entries yet.")}</p>
          </Panel>
        </DetailLayout>
      </div>
    </ProductDraftProvider>
  );
}
