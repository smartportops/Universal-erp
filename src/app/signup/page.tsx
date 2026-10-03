import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { one } from "@/lib/format";
import { translator } from "@/lib/i18n-server";
import { register } from "@/server/actions/auth";
import { Banner, Field, fieldClass } from "@/components/ui";
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[13px] font-semibold text-primary-ink">A</span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Aera</span>
        </div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{tx("Create your company")}</h1>
        <p className="mt-1 text-[13px] text-muted">{tx("Your own workspace with catalog, orders, inventory and bookkeeping.")}</p>
        <div className="mt-6 rounded-2xl bg-surface p-6 shadow-[var(--shadow)]">
          <Banner error={error ? tx(error) : undefined} />
          <form action={register} className="space-y-4">
            <Field label={tx("Company")}>
              <input name="company" autoComplete="organization" required autoFocus className={fieldClass} />
            </Field>
            <Field label={tx("Your name")}>
              <input name="name" autoComplete="name" required className={fieldClass} />
            </Field>
            <Field label={tx("Email")}>
              <input name="email" type="email" autoComplete="email" required className={fieldClass} />
            </Field>
            <Field label={tx("Password")} hint={tx("At least 8 characters")}>
              <input name="password" type="password" autoComplete="new-password" required minLength={8} className={fieldClass} />
            </Field>
            <SubmitButton pendingLabel="Creating..." className="w-full">{tx("Create account")}</SubmitButton>
          </form>
        </div>
        <p className="mt-6 text-[12px] text-muted">
          {tx("Already have an account?")}{" "}
          <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">
            {tx("Sign in")}
          </Link>
        </p>
      </div>
    </main>
  );
}
