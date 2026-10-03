import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { one } from "@/lib/format";
import { getLocale, translator } from "@/lib/i18n-server";
import { createCustomer } from "@/server/actions/catalog";
import { Banner, Field, PageIntro, Panel, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("New customer") };
}

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  if (!can(session.role, "sales.write")) redirect("/customers");
  const query = await searchParams;
  void locale;
  return (
    <div className="mx-auto max-w-lg">
      <PageIntro back={{ href: "/customers", label: tx("Customers") }} title={tx("New customer")} description={tx("You can add terms and tax details later on the customer.")} />
      <Banner error={one(query.error)} />
      <Panel>
        <form action={createCustomer} className="space-y-4">
          <Field label={tx("Name or company")}><input name="name" required autoFocus className={fieldClass} /></Field>
          <Field label={tx("Email")}><input name="email" type="email" className={fieldClass} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx("Type")}>
              <select name="type" className={fieldClass}><option value="b2c">{tx("Consumer")}</option><option value="b2b">{tx("Business")}</option></select>
            </Field>
            <Field label={tx("City")}><input name="city" className={fieldClass} /></Field>
          </div>
          <div className="flex justify-end pt-1"><SubmitButton>{tx("Create customer")}</SubmitButton></div>
        </form>
      </Panel>
    </div>
  );
}
