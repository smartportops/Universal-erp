import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { one } from "@/lib/format";
import { transferStockAction } from "@/server/actions/inventory";
import { getLocale, translator } from "@/lib/i18n-server";
import { Banner, Field, PageIntro, Panel, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Transfer") };
}

export default async function TransferPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  if (!can(session.role, "stock.write")) redirect("/stock");
  const query = await searchParams;
  const [variants, locations] = await Promise.all([
    prisma.productVariant.findMany({ where: { organizationId: session.organization.id }, include: { product: true }, orderBy: { sku: "asc" } }),
    prisma.location.findMany({
      where: { warehouse: { organizationId: session.organization.id }, active: true },
      include: { warehouse: true },
      orderBy: [{ warehouse: { isDefault: "desc" } }, { code: "asc" }],
    }),
  ]);
  const label = (location: (typeof locations)[number]) => `${location.warehouse.name} · ${location.code} ${location.name}`;
  return (
    <div className="mx-auto max-w-lg">
      <PageIntro back={{ href: "/stock", label: tx("Stock movements") }} title={tx("Transfer")} description={tx("Out of the source location, into the destination. Both are posted as movements.")} />
      <Banner error={one(query.error)} />
      <Panel>
        <form action={transferStockAction} className="space-y-4">
          <Field label={tx("Product")}>
            <select name="variantId" defaultValue={one(query.variant)} className={fieldClass}>
              {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.product.name} · {variant.sku}</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx("From")}>
              <select name="fromLocationId" className={fieldClass}>{locations.map((location) => <option key={location.id} value={location.id}>{label(location)}</option>)}</select>
            </Field>
            <Field label={tx("To")}>
              <select name="toLocationId" defaultValue={locations[1]?.id} className={fieldClass}>{locations.map((location) => <option key={location.id} value={location.id}>{label(location)}</option>)}</select>
            </Field>
          </div>
          <Field label={tx("Quantity")}>
            <input name="quantity" type="number" min={1} required className={fieldClass} />
          </Field>
          <div className="flex justify-end pt-1">
            <SubmitButton>{tx("Transfer")}</SubmitButton>
          </div>
        </form>
      </Panel>
    </div>
  );
}
