import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { one } from "@/lib/format";
import { adjustStockAction } from "@/server/actions/inventory";
import { getLocale, translator } from "@/lib/i18n-server";
import { Banner, Field, PageIntro, Panel, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Count stock") };
}

export default async function AdjustPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  if (!can(session.role, "stock.write")) redirect("/stock");
  const query = await searchParams;
  const back = one(query.back).startsWith("/") ? one(query.back) : "/stock";
  const [variants, locations] = await Promise.all([
    prisma.productVariant.findMany({ where: { organizationId: session.organization.id }, include: { product: true }, orderBy: { sku: "asc" } }),
    prisma.location.findMany({
      where: { warehouse: { organizationId: session.organization.id }, active: true },
      include: { warehouse: true },
      orderBy: [{ warehouse: { isDefault: "desc" } }, { code: "asc" }],
    }),
  ]);
  const preferred = locations.find((location) => location.type === "pick") ?? locations[0];
  return (
    <div className="mx-auto max-w-lg">
      <PageIntro back={{ href: back, label: tx("Back") }} title={tx("Count stock")} description={tx("Enter what is actually on the shelf. The difference is posted as a movement.")} />
      <Banner error={one(query.error)} />
      <Panel>
        <form action={adjustStockAction} className="space-y-4">
          <input type="hidden" name="back" value={back} />
          <Field label={tx("Product")}>
            <select name="variantId" defaultValue={one(query.variant)} className={fieldClass}>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.product.name} · {variant.sku}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tx("Location")}>
            <select name="locationId" defaultValue={preferred?.id} className={fieldClass}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.warehouse.name} · {location.code} {location.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx("Counted")}>
              <input name="counted" type="number" min={0} required autoFocus className={fieldClass} placeholder={tx("e.g. 35")} />
            </Field>
            <Field label={tx("Reason")}>
              <input name="reason" required defaultValue={tx("Stocktake")} className={fieldClass} />
            </Field>
          </div>
          <div className="flex justify-end pt-1">
            <SubmitButton>{tx("Post difference")}</SubmitButton>
          </div>
        </form>
      </Panel>
    </div>
  );
}
