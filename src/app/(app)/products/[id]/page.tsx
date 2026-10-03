import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { centsToInput, formatWhen, money, one, qty, signedQty } from "@/lib/format";
import { movementTypes, productStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { addVariant } from "@/server/actions/catalog";
import { addProductSupplier, makeCoverImage, removeProductImage, removeProductSupplier } from "@/server/actions/product-media";
import { entityExtras } from "@/server/entity";
import { getBalances, needsReorder } from "@/server/snapshot";
import { ActivityFeed, DetailLayout, EntityFields } from "@/components/entity-panel";
import { ImageUpload } from "@/components/image-upload";
import { DraftDescription, DraftField, DraftNotice, DraftStatus, DraftToggle, ProductDraftProvider, SaveProductButton } from "@/components/product-draft";
import { Banner, PageIntro, Panel, Pill, Properties } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });
  return { title: product?.name ?? tx("Product") };
}

const cell = "px-3 py-2";
const inputClass = "h-8 w-full rounded-md bg-surface px-2 text-[13px] outline-none ring-1 ring-line-strong placeholder:text-faint focus:ring-2 focus:ring-accent/40";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const product = await prisma.product.findFirst({
    where: { id, organizationId: session.organization.id },
    include: {
      variants: { include: { preferredSupplier: true, serials: true }, orderBy: { sku: "asc" } },
      images: { orderBy: { position: "asc" } },
      suppliers: { include: { supplier: true }, orderBy: { createdAt: "asc" } },
      taxRate: true,
    },
  });
  if (!product) notFound();
  const variantIds = product.variants.map((variant) => variant.id);
  const [balances, movements, extras, taxRates, allSuppliers] = await Promise.all([
    getBalances(session.organization.id),
    prisma.stockMovement.findMany({
      where: { organizationId: session.organization.id, variantId: { in: variantIds } },
      include: { variant: true, warehouse: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    entityExtras(session.organization.id, "product", product.id, [{ type: "product_variant", ids: variantIds }]),
    prisma.taxRate.findMany({ where: { organizationId: session.organization.id }, orderBy: { rateBps: "desc" } }),
    prisma.supplier.findMany({ where: { organizationId: session.organization.id, status: "active" }, orderBy: { name: "asc" } }),
  ]);
  const rows = balances.filter((row) => row.productId === product.id);
  const onHand = rows.reduce((sum, row) => sum + row.onHand, 0);
  const incoming = rows.reduce((sum, row) => sum + row.incoming, 0);
  const writable = can(session.role, "catalog.write");
  const linked = product.suppliers.map((link) => link.supplier);
  const legacy = product.variants.find((variant) => variant.preferredSupplier)?.preferredSupplier;
  const suppliers = linked.length ? linked : legacy ? [legacy] : [];
  const available = allSuppliers.filter((supplier) => !suppliers.some((item) => item.id === supplier.id));
  const serials = product.variants.flatMap((variant) => variant.serials);
  const draft: Record<string, string> = {
    "product:name": product.name,
    "product:status": product.status,
    "product:category": product.category,
    "product:taxRateId": product.taxRateId ?? "",
    "product:description": product.description,
    "product:allowOversell": product.allowOversell ? "true" : "false",
    "product:trackSerialsIn": product.trackSerialsIn ? "true" : "false",
    "product:trackSerialsOut": product.trackSerialsOut ? "true" : "false",
  };
  for (const variant of product.variants) {
    draft[`variant:${variant.id}:name`] = variant.name;
    draft[`variant:${variant.id}:sku`] = variant.sku;
    draft[`variant:${variant.id}:ean`] = variant.ean;
    draft[`variant:${variant.id}:price`] = centsToInput(variant.priceCents);
    draft[`variant:${variant.id}:cost`] = centsToInput(variant.costCents);
    draft[`variant:${variant.id}:weight`] = String(variant.weightGrams);
    draft[`variant:${variant.id}:reorder`] = String(variant.reorderPoint);
  }
  void locale;

  return (
    <ProductDraftProvider key={product.updatedAt.toISOString()} mode="edit" productId={product.id} variantIds={product.variants.map((variant) => variant.id)} initial={draft}>
    <div>
      <PageIntro
        back={{ href: "/products", label: tx("Products") }}
        title={<DraftField k="product:name" entity="product" id={product.id} field="name" placeholder="Product title" disabled={!writable} textClassName="text-[22px] font-semibold tracking-[-0.02em]" className="min-w-[320px]" />}
        badges={<DraftStatus map={txMap(productStatus, tx)} />}
        actions={writable ? <SaveProductButton /> : undefined}
      />
      <DraftNotice />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <DetailLayout
        side={
          <>
            <Panel title={tx("Details")}>
              <Properties
                items={[
                  {
                    label: tx("Status"),
                    value: (
                      <DraftField
                        k="product:status"
                        entity="product"
                        id={product.id}
                        field="status"
                        type="select"
                        disabled={!writable}
                        options={Object.entries(productStatus).map(([value, item]) => ({ value, label: tx(item.label) }))}
                      />
                    ),
                  },
                  { label: tx("Category"), value: <DraftField k="product:category" entity="product" id={product.id} field="category" disabled={!writable} placeholder={tx("Set category")} /> },
                  {
                    label: tx("Tax rate"),
                    value: (
                      <DraftField
                        k="product:taxRateId"
                        entity="product"
                        id={product.id}
                        field="taxRateId"
                        type="select"
                        disabled={!writable}
                        options={[{ value: "", label: tx("Default") }, ...taxRates.map((rate) => ({ value: rate.id, label: `${rate.name} (${rate.rateBps / 100} %)` }))]}
                      />
                    ),
                  },
                  { label: tx("Stock"), value: <span className={onHand < 0 ? "font-medium text-danger" : "font-medium"}>{qty(onHand)}</span> },
                  { label: tx("Incoming"), value: qty(incoming) },
                ]}
              />
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1.5 text-[13px] text-muted">{suppliers.length === 1 ? tx("Supplier") : tx("Suppliers")}</div>
                <ul className="space-y-1">
                  {suppliers.map((supplier) => (
                    <li key={supplier.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <Link href={`/suppliers/${supplier.id}`} className="truncate hover:underline">{supplier.name}</Link>
                      {writable ? (
                        <form action={removeProductSupplier}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="supplierId" value={supplier.id} />
                          <button className="rounded px-1 text-[12px] text-faint hover:text-danger" aria-label={tx("Remove")}>×</button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                  {suppliers.length === 0 ? <li className="text-[13px] text-faint">{tx("No supplier yet")}</li> : null}
                </ul>
                {writable && available.length ? (
                  <form action={addProductSupplier} className="mt-2 flex items-center gap-2">
                    <input type="hidden" name="productId" value={product.id} />
                    <select name="supplierId" defaultValue="" required aria-label={tx("Add supplier")} className="h-8 min-w-0 flex-1 rounded-md bg-surface px-2 text-[13px] text-muted outline-none ring-1 ring-line-strong">
                      <option value="" disabled>{tx("Add supplier")}</option>
                      {available.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary" size="sm">{tx("Add")}</SubmitButton>
                  </form>
                ) : null}
              </div>
              <div className="mt-3 border-t border-line pt-2">
                <DraftToggle k="product:allowOversell" label={tx("Allow overselling")} hint={tx("Orders may exceed stock")} disabled={!writable} />
                <DraftToggle k="product:trackSerialsIn" label={tx("Serial numbers on receipt")} hint={tx("Ask for serials when goods arrive")} disabled={!writable} />
                <DraftToggle k="product:trackSerialsOut" label={tx("Serial numbers on dispatch")} hint={tx("Ask for serials when shipping")} disabled={!writable} />
              </div>
            </Panel>
            <EntityFields entityId={product.id} fields={extras.fields} files={extras.files} canEdit={writable} />
          </>
        }
      >
        <Panel title={tx("Media")} flush>
          <div className="grid grid-cols-3 gap-3 px-5 pb-5 sm:grid-cols-4 md:grid-cols-5">
            {product.images.map((image, index) => (
              <div key={image.id} className="group relative aspect-square overflow-hidden rounded-xl bg-subtle ring-1 ring-line">
                <img src={`/api/images/${image.id}`} alt={image.filename} className="h-full w-full object-cover" />
                {index === 0 ? <span className="absolute left-1.5 top-1.5 rounded-md bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium text-muted">{tx("Cover")}</span> : null}
                {writable ? (
                  <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {index > 0 ? (
                      <form action={makeCoverImage}>
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="id" value={image.id} />
                        <button className="rounded-md bg-surface/95 px-1.5 py-0.5 text-[11px] text-muted shadow-[var(--shadow-xs)] hover:text-ink">{tx("Make cover")}</button>
                      </form>
                    ) : <span />}
                    <form action={removeProductImage}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="id" value={image.id} />
                      <button className="rounded-md bg-surface/95 px-1.5 py-0.5 text-[11px] text-muted shadow-[var(--shadow-xs)] hover:text-danger" aria-label={tx("Remove")}>×</button>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
            {writable ? <div className={product.images.length ? "" : "col-span-full"}><ImageUpload productId={product.id} compact={product.images.length > 0} /></div> : null}
            {!writable && product.images.length === 0 ? <p className="col-span-full text-[13px] text-muted">{tx("No images yet.")}</p> : null}
          </div>
        </Panel>

        <Panel title={tx("Description")}>
          <DraftDescription disabled={!writable} />
        </Panel>

        <Panel title={tx("Variants")} description={writable ? tx("Click a value to edit it directly.") : undefined} flush>
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
                {product.variants.map((variant) => {
                  const balance = rows.find((row) => row.variantId === variant.id);
                  const stock = balance?.onHand ?? 0;
                  return (
                    <tr key={variant.id} className="border-b border-line last:border-0">
                      <td className={`${cell} pl-5`}><DraftField k={`variant:${variant.id}:name`} entity="variant" id={variant.id} field="name" disabled={!writable} /></td>
                      <td className={cell}><DraftField k={`variant:${variant.id}:sku`} entity="variant" id={variant.id} field="sku" disabled={!writable} mono /></td>
                      <td className={cell}><DraftField k={`variant:${variant.id}:ean`} entity="variant" id={variant.id} field="ean" disabled={!writable} mono placeholder={tx("EAN")} /></td>
                      <td className={cell}><DraftField k={`variant:${variant.id}:price`} entity="variant" id={variant.id} field="priceCents" type="money" display={money(variant.priceCents)} disabled={!writable} align="right" /></td>
                      <td className={cell}><DraftField k={`variant:${variant.id}:cost`} entity="variant" id={variant.id} field="costCents" type="money" display={money(variant.costCents)} disabled={!writable} align="right" /></td>
                      <td className={cell}><DraftField k={`variant:${variant.id}:weight`} entity="variant" id={variant.id} field="weightGrams" type="number" display={variant.weightGrams ? qty(variant.weightGrams) : undefined} disabled={!writable} align="right" placeholder="0" /></td>
                      <td className={cell}><DraftField k={`variant:${variant.id}:reorder`} entity="variant" id={variant.id} field="reorderPoint" type="number" disabled={!writable} align="right" /></td>
                      <td className="py-2 pl-3 pr-5 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          {balance && stock < 0 ? <Pill tone="danger">{tx("Negative")}</Pill> : balance && needsReorder(balance) ? <Pill tone="warning">{tx("Reorder")}</Pill> : null}
                          <span className={`tabular-nums font-medium ${stock < 0 ? "text-danger" : ""}`}>{qty(stock)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {writable ? (
            <form action={addVariant} className="grid grid-cols-2 items-center gap-2 border-t border-line bg-subtle px-5 py-3 sm:grid-cols-[1fr_1fr_110px_110px_auto]">
              <input type="hidden" name="productId" value={product.id} />
              <input name="name" placeholder={tx("New variant, e.g. size L")} className={inputClass} />
              <input name="sku" required placeholder={tx("SKU")} className={`${inputClass} font-mono`} />
              <input name="price" required placeholder={tx("Price")} defaultValue={centsToInput(product.variants[0]?.priceCents ?? 0)} className={`${inputClass} text-right`} />
              <input name="cost" required placeholder={tx("Cost")} defaultValue={centsToInput(product.variants[0]?.costCents ?? 0)} className={`${inputClass} text-right`} />
              <SubmitButton variant="secondary" size="sm">{tx("Add")}</SubmitButton>
            </form>
          ) : null}
        </Panel>

        <Panel title={tx("Stock movements")} action={<Link href={`/stock?q=${encodeURIComponent(product.variants[0]?.sku ?? "")}`} className="text-[13px] text-muted hover:text-ink">{tx("All")}</Link>} flush>
          {movements.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">{tx("No movements yet.")}</p> : null}
          <ul>
            {movements.map((movement) => (
              <li key={movement.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-[13px]">
                <span className={`w-14 shrink-0 text-right font-medium tabular-nums ${movement.quantity < 0 ? "text-danger" : "text-ok"}`}>{signedQty(movement.quantity)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {tx(movementTypes[movement.type] ?? movement.type)}
                  <span className="ml-2 text-muted">{movement.referenceLabel}</span>
                </span>
                <span className="hidden font-mono text-[12px] text-muted sm:inline">{movement.variant.sku}</span>
                <span className="w-28 shrink-0 text-right text-[12px] text-faint">{formatWhen(movement.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {serials.length ? (
          <Panel title={tx("Serial numbers")} flush>
            <ul>
              {serials.map((serial) => (
                <li key={serial.id} className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px]">
                  <span className="font-mono text-[12px]">{serial.value}</span>
                  <Pill tone={serial.status === "shipped" ? "info" : "ok"}>{serial.status === "shipped" ? tx("Shipped") : tx("In warehouse")}</Pill>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <ActivityFeed
          entityType="product"
          entityId={product.id}
          activities={extras.activities}
          canComment={can(session.role, "comments.write")}
          returnTo={`/products/${product.id}`}
        />
      </DetailLayout>
    </div>
    </ProductDraftProvider>
  );
}
