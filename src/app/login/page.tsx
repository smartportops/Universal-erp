import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { one } from "@/lib/format";
import { translator } from "@/lib/i18n-server";
import { confirmLoginTotp, login } from "@/server/actions/auth";
import { Banner, Field, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Sign in") };
}

const demo = [
  ["mia.berg@heller.demo", "Owner"],
  ["jonas.hart@heller.demo", "Operations"],
  ["leonie.vogel@heller.demo", "Warehouse"],
  ["adam.weiss@heller.demo", "Finance"],
  ["guest.view@heller.demo", "View only"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; step?: string; notice?: string }> }) {
  const tx = await translator();
  const session = await getSession();
  if (session) redirect("/");
  const query = await searchParams;
  const step = one(query.step);
  const error = one(query.error);
  const notice = one(query.notice);
  const showDemo = process.env.AERA_DEMO === "1";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[13px] font-semibold text-primary-ink">A</span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Aera</span>
        </div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{step === "totp" ? tx("Confirmation code") : tx("Welcome back")}</h1>
        <p className="mt-1 text-[13px] text-muted">{step === "totp" ? tx("The 6-digit code from your authenticator app.") : tx("The operating system for your trade.")}</p>
        <div className="mt-6 rounded-2xl bg-surface p-6 shadow-[var(--shadow)]">
          <Banner error={error ? tx(error) : undefined} notice={notice ? tx(notice) : undefined} />
          {step === "totp" ? (
            <form action={confirmLoginTotp} className="space-y-4">
              <Field label={tx("Verification code")}>
                <input name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus className={`${fieldClass} text-center font-mono tracking-[0.3em]`} />
              </Field>
              <SubmitButton pendingLabel="Checking..." className="w-full">{tx("Confirm")}</SubmitButton>
            </form>
          ) : (
            <form action={login} className="space-y-4">
              <Field label={tx("Email")}>
                <input name="email" type="email" autoComplete="username" required autoFocus defaultValue={showDemo ? "mia.berg@heller.demo" : undefined} className={fieldClass} />
              </Field>
              <Field label={tx("Password")}>
                <input name="password" type="password" autoComplete="current-password" required defaultValue={showDemo ? "aera-beta" : undefined} className={fieldClass} />
              </Field>
              <SubmitButton pendingLabel="Signing in..." className="w-full">{tx("Sign in")}</SubmitButton>
            </form>
          )}
        </div>
        <p className="mt-6 text-[12px] text-muted">
          {tx("New here?")}{" "}
          <Link href="/signup" className="font-medium text-ink underline-offset-2 hover:underline">
            {tx("Create your company")}
          </Link>
        </p>
        {showDemo ? (
          <div className="mt-6 text-[12px] text-muted">
            <div className="mb-1.5 font-medium text-ink">{tx("Demo accounts · password aera-beta")}</div>
            <ul className="space-y-0.5">
              {demo.map(([email, role]) => (
                <li key={email} className="flex justify-between">
                  <span className="font-mono">{email}</span>
                  <span className="text-faint">{tx(role)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
