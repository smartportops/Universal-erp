import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { one } from "@/lib/format";
import { translator } from "@/lib/i18n-server";
import { register } from "@/server/actions/auth";
import { Banner } from "@/components/ui";
import { AuthField, AuthFrame, authField } from "@/components/auth-frame";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Create account") };
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const tx = await translator();
  const session = await getSession();
  if (session) redirect("/");
  const query = await searchParams;
  const error = one(query.error);
  return (
    <AuthFrame
      title={tx("Create your company")}
      subtitle={tx("Your own workspace for catalog, orders, inventory and bookkeeping. Free during the beta.")}
      footer={
        <>
          {tx("Already have an account?")}{" "}
          <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">
            {tx("Sign in")}
          </Link>
        </>
      }
    >
      <Banner error={error ? tx(error) : undefined} />
      <form action={register} className="space-y-4">
        <AuthField label={tx("Company")}>
          <input name="company" autoComplete="organization" required autoFocus placeholder={tx("Acme Goods GmbH")} className={authField} />
        </AuthField>
        <AuthField label={tx("Your name")}>
          <input name="name" autoComplete="name" required className={authField} />
        </AuthField>
        <AuthField label={tx("Work email")}>
          <input name="email" type="email" autoComplete="email" required placeholder="name@company.com" className={authField} />
        </AuthField>
        <AuthField label={tx("Password")} hint={tx("At least 8 characters")}>
          <input name="password" type="password" autoComplete="new-password" required minLength={8} className={authField} />
        </AuthField>
        <SubmitButton size="lg" pendingLabel="Creating..." className="w-full">{tx("Create account")}</SubmitButton>
        <p className="text-center text-[12px] text-faint">{tx("No credit card. Your warehouse, tax rates and number ranges are ready when you land.")}</p>
      </form>
    </AuthFrame>
  );
}
