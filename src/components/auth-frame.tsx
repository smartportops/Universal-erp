import Link from "next/link";

export const authField =
  "h-11 w-full rounded-lg bg-surface px-3.5 text-[14px] shadow-[var(--shadow-xs)] outline-none ring-1 ring-line-strong transition placeholder:text-faint focus:ring-2 focus:ring-accent/40";

export function AuthField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function AuthFrame({
  title,
  subtitle,
  children,
  footer,
  below,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg px-6 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(55%_60%_at_50%_0%,rgba(80,70,229,0.12),transparent_70%)]" />
      <div className="relative w-full max-w-[400px]">
        <Link href="/" className="mx-auto mb-7 flex w-fit items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-[15px] font-semibold text-primary-ink shadow-[var(--shadow)]">A</span>
          <span className="text-[18px] font-semibold tracking-[-0.02em]">Aera</span>
        </Link>
        {title ? (
          <div className="mb-6 text-center">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-[14px] leading-6 text-muted">{subtitle}</p> : null}
          </div>
        ) : null}
        <div className="rounded-2xl bg-surface p-6 shadow-[var(--shadow-lg)] ring-1 ring-line">{children}</div>
        {footer ? <p className="mt-6 text-center text-[13px] text-muted">{footer}</p> : null}
        {below}
      </div>
    </main>
  );
}
