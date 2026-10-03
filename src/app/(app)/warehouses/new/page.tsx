import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { one } from "@/lib/format";
import { warehouseTypes } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { createWarehouse } from "@/server/actions/inventory";
import { Banner, Field, PageIntro, Panel, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("New warehouse") };
}

export default async function NewWarehousePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  if (!can(session.role, "settings.write")) redirect("/warehouses");
  const query = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <PageIntro back={{ href: "/warehouses", label: tx("Warehouses") }} title={tx("New warehouse")} description={tx("Gets a picking location right away. You add more locations on the warehouse page.")} />
      <Banner error={one(query.error)} />
      <Panel>
        <form action={createWarehouse} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <Field label={tx("Code")}><input name="code" required placeholder="CGN" className={`${fieldClass} font-mono`} /></Field>
            <Field label={tx("Name")}><input name="name" required autoFocus placeholder={tx("Cologne fulfillment")} className={fieldClass} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx("Type")}>
              <select name="type" className={fieldClass}>
                {Object.entries(warehouseTypes).map(([value, label]) => <option key={value} value={value}>{tx(label)}</option>)}
              </select>
            </Field>
            <Field label={tx("City")}><input name="city" className={fieldClass} /></Field>
          </div>
          <div className="flex justify-end pt-1"><SubmitButton>{tx("Create warehouse")}</SubmitButton></div>
        </form>
      </Panel>
    </div>
  );
}
