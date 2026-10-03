import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { one } from "@/lib/format";
import { getLocale, translator } from "@/lib/i18n-server";
import { createSupplier } from "@/server/actions/catalog";
import { Banner, Field, PageIntro, Panel, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("New supplier") };
}

export default async function NewSupplierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  if (!can(session.role, "purchasing.write")) redirect("/suppliers");
  const query = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <PageIntro back={{ href: "/suppliers", label: tx("Suppliers") }} title={tx("New supplier")} />
      <Banner error={one(query.error)} />
      <Panel>
        <form action={createSupplier} className="space-y-4">
          <Field label={tx("Name")}><input name="name" required autoFocus className={fieldClass} /></Field>
          <Field label={tx("Email for purchase orders")}><input name="email" type="email" className={fieldClass} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx("Lead time in days")}><input name="leadTimeDays" type="number" defaultValue={14} className={fieldClass} /></Field>
            <Field label={tx("Country")}><input name="country" defaultValue="DE" className={fieldClass} /></Field>
          </div>
          <div className="flex justify-end pt-1"><SubmitButton>{tx("Create supplier")}</SubmitButton></div>
        </form>
      </Panel>
    </div>
  );
}
