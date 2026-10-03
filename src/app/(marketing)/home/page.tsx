import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Boxes,
  Check,
  FileText,
  Globe,
  KeyRound,
  Package,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { getLocale, getTheme, translator } from "@/lib/i18n-server";
import { Logo, PrefsSwitch } from "@/components/marketing";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tx = await translator();
  return {
    title: { absolute: "Aera · " + tx("The ERP for modern commerce") },
    description: tx("Catalog, orders, inventory, purchasing and bookkeeping in one fast, AI-native workspace."),
  };
}

const primary =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-medium text-primary-ink shadow-[var(--shadow-xs)] transition-colors hover:bg-[#2a2a30] dark:hover:bg-[#e4e4e7]";
const secondary =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-surface px-4 text-[14px] font-medium text-ink ring-1 ring-line-strong transition-colors hover:bg-subtle";
const navLink = "rounded-full px-3 py-1.5 text-[13px] text-muted transition-colors hover:text-ink";

export default async function HomePage() {
  const [tx, locale, theme] = await Promise.all([translator(), getLocale(), getTheme()]);

  const features = [
    { icon: Package, title: "Catalog", body: "Products, variants, SKUs, EANs, images and suppliers. Edit inline, save once." },
    { icon: ShoppingCart, title: "Orders", body: "Every channel in one queue. Pick, ship, invoice and refund without leaving the page." },
    { icon: Boxes, title: "Inventory", body: "An append-only stock ledger. On-hand is always the sum of movements, never a stale number." },
    { icon: Truck, title: "Purchasing", body: "Reorder suggestions from reorder points, lead times and open orders. One click to a purchase order." },
    { icon: FileText, title: "Invoices & payments", body: "Issue, settle and dun. Amounts are stored in integer cents, so totals always add up." },
    { icon: BookOpenText, title: "Bookkeeping", body: "Shipments, invoices and payments post journal entries automatically. Balanced by design." },
  ];

  const trust = [
    { icon: Users, title: "Your own company", body: "Every registration creates a separate organization. Nobody else can see your data." },
    { icon: KeyRound, title: "Roles and 2FA", body: "Owner, operations, warehouse, finance and view-only roles. Optional authenticator codes." },
    { icon: ScrollText, title: "Audit trail", body: "Every change is recorded with who, what and when. The timeline is for the team, the audit is for proof." },
    { icon: Globe, title: "Hosted in the EU", body: "Application and database run in the Netherlands. Data stays in Europe." },
  ];

  const principles = [
    "One source of truth. The dashboard, reports and exports read the same numbers.",
    "Everything is editable in place. No modal mazes, no separate edit screens.",
    "Fast by default. Server-rendered pages, keyboard first, command palette on every screen.",
    "Two languages, light and dark. Switch per user, not per company.",
  ];

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            <a href="#product" className={navLink}>{tx("Features")}</a>
            <a href="#assistant" className={navLink}>{tx("Assistant")}</a>
            <a href="#security" className={navLink}>{tx("Security")}</a>
            <a href="#pricing" className={navLink}>{tx("Pricing")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink sm:inline-flex">
              {tx("Sign in")}
            </Link>
            <Link href="/signup" className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-ink transition-colors hover:bg-[#2a2a30] dark:hover:bg-[#e4e4e7]">
              {tx("Sign up")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(80,70,229,0.14),transparent_70%)]" />
          <div className="mx-auto max-w-[1120px] px-6 pb-16 pt-24 text-center sm:pt-32">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 text-[12px] font-medium text-muted ring-1 ring-line transition-colors hover:text-ink">
              <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-accent">{tx("Open beta")}</span>
              {tx("Free while we build")}
              <ArrowRight className="h-3 w-3" />
            </Link>
            <h1 className="mx-auto mt-6 max-w-[820px] text-[42px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[68px]">
              {tx("Run your commerce business from one place.")}
            </h1>
            <p className="mx-auto mt-6 max-w-[600px] text-[16px] leading-7 text-muted sm:text-[18px]">
              {tx("Aera brings catalog, orders, inventory, purchasing and bookkeeping into one fast, AI-native workspace. Built for e-commerce teams in Europe.")}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={primary}>
                {tx("Create your company")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className={secondary}>{tx("Sign in")}</Link>
            </div>
            <p className="mt-4 text-[12px] text-faint">{tx("Set up in two minutes. No credit card.")}</p>
          </div>

          <div id="product" className="mx-auto max-w-[1120px] scroll-mt-24 px-6">
            <div className="relative rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-lg)] ring-1 ring-line">
              <div className="relative aspect-[1440/780] overflow-hidden rounded-[12px] ring-1 ring-line">
                <Image
                  src="/marketing/overview.png"
                  alt={tx("The Aera overview with revenue, open orders, unpaid invoices and low stock.")}
                  fill
                  priority
                  sizes="(min-width: 1120px) 1096px, 100vw"
                  className="object-cover object-top dark:hidden"
                />
                <Image
                  src="/marketing/overview-dark.png"
                  alt=""
                  fill
                  sizes="(min-width: 1120px) 1096px, 100vw"
                  className="hidden object-cover object-top dark:block"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1120px] px-6 py-20">
          <dl className="grid gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line sm:grid-cols-3">
            {[
              ["Integer cents", "Money is never a float. Totals, taxes and journals add up to the cent."],
              ["Append-only ledger", "Stock is a history of movements, so every balance can be explained."],
              ["Audit on every change", "Each edit leaves an entry with actor and timestamp. Nothing disappears."],
            ].map(([title, body]) => (
              <div key={title} className="bg-surface p-6">
                <dt className="text-[15px] font-semibold tracking-[-0.01em]">{tx(title)}</dt>
                <dd className="mt-1.5 text-[13px] leading-6 text-muted">{tx(body)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-[1120px] px-6 pb-24">
          <div className="max-w-[640px]">
            <p className="text-[13px] font-medium text-accent">{tx("Everything a store runs on")}</p>
            <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
              {tx("Six modules. One data model. Zero glue code.")}
            </h2>
            <p className="mt-4 text-[16px] leading-7 text-muted">
              {tx("Every module hangs off the same products, customers and warehouses. Ship an order and the stock, invoice and journal move with it.")}
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-2xl bg-surface p-6 ring-1 ring-line transition-shadow hover:shadow-[var(--shadow)]">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-subtle ring-1 ring-line">
                  <feature.icon className="h-4 w-4 text-ink" strokeWidth={1.75} />
                </div>
                <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.01em]">{tx(feature.title)}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted">{tx(feature.body)}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="assistant" className="scroll-mt-24 border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 py-24 lg:grid-cols-2">
            <div>
              <p className="text-[13px] font-medium text-accent">{tx("Assistant")}</p>
              <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
                {tx("Ask your company a question.")}
              </h2>
              <p className="mt-4 text-[16px] leading-7 text-muted">
                {tx("The assistant reads the same data as every page: late orders, negative stock, overdue invoices, what to reorder. It answers with numbers and links, not guesses.")}
              </p>
              <ul className="mt-8 space-y-3">
                {principles.map((line) => (
                  <li key={line} className="flex gap-3 text-[14px] leading-6 text-muted">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-ink" strokeWidth={2} />
                    <span>{tx(line)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-bg p-2 ring-1 ring-line">
              <div className="rounded-[12px] bg-surface p-5 ring-1 ring-line">
                <div className="flex items-center gap-2 text-[12px] text-faint">
                  <Sparkles className="h-3.5 w-3.5" />
                  {tx("Assistant")}
                  <span className="ml-auto rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-line">⌘J</span>
                </div>
                <div className="mt-5 flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[13px] text-primary-ink">
                    {tx("Which orders are late?")}
                  </div>
                </div>
                <div className="mt-3 max-w-[90%] rounded-2xl rounded-bl-md bg-subtle px-4 py-3 text-[13px] leading-6 text-ink ring-1 ring-line">
                  {tx("2 late orders.")}
                  <ul className="mt-1 space-y-1 text-muted">
                    <li>
                      <span className="font-mono text-ink">SO-10043</span> · {tx("Nordlicht Studio")} · {tx("promised {n} days ago", { n: 2 })}
                    </li>
                    <li>
                      <span className="font-mono text-ink">SO-10039</span> · {tx("Kaya Home")} · {tx("promised {n} days ago", { n: 4 })}
                    </li>
                  </ul>
                  <p className="mt-2 text-muted">{tx("Both are picked and waiting for a carrier label.")}</p>
                </div>
                <div className="mt-5 flex h-10 items-center rounded-lg bg-bg px-3 text-[13px] text-faint ring-1 ring-line">
                  {tx("Ask anything about your company…")}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="mx-auto max-w-[1120px] scroll-mt-24 px-6 py-24">
          <div className="max-w-[640px]">
            <p className="text-[13px] font-medium text-accent">{tx("Security")}</p>
            <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
              {tx("Your company, your data.")}
            </h2>
          </div>
          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {trust.map((item) => (
              <div key={item.title}>
                <item.icon className="h-5 w-5 text-ink" strokeWidth={1.75} />
                <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.01em]">{tx(item.title)}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted">{tx(item.body)}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 border-t border-line bg-surface">
          <div className="mx-auto max-w-[1120px] px-6 py-24">
            <div className="mx-auto max-w-[520px] text-center">
              <p className="text-[13px] font-medium text-accent">{tx("Pricing")}</p>
              <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">{tx("Free during the beta.")}</h2>
              <p className="mt-4 text-[16px] leading-7 text-muted">
                {tx("Use every module with your whole team. Pricing comes with the public launch, and beta companies keep a discount.")}
              </p>
            </div>
            <div className="mx-auto mt-10 max-w-[420px] rounded-2xl bg-bg p-8 ring-1 ring-line">
              <div className="flex items-baseline gap-1">
                <span className="text-[44px] font-semibold tracking-[-0.04em]">0 €</span>
                <span className="text-[13px] text-muted">/ {tx("month")}</span>
              </div>
              <ul className="mt-6 space-y-2.5">
                {["All modules", "Unlimited users and roles", "Two-factor sign-in", "CSV import and export", "REST API and webhooks"].map((line) => (
                  <li key={line} className="flex items-center gap-2.5 text-[14px] text-ink">
                    <Check className="h-4 w-4 text-ok" strokeWidth={2} />
                    {tx(line)}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={`${primary} mt-8 w-full`}>
                {tx("Create your company")}
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1120px] px-6 py-24 text-center">
          <ShieldCheck className="mx-auto h-6 w-6 text-faint" strokeWidth={1.5} />
          <h2 className="mt-5 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
            {tx("Set up your company in two minutes.")}
          </h2>
          <p className="mx-auto mt-4 max-w-[480px] text-[16px] leading-7 text-muted">
            {tx("A name, an email and a password. Your warehouse, tax rates and number ranges are ready when you land.")}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className={primary}>
              {tx("Sign up")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className={secondary}>{tx("Sign in")}</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <Logo />
            <span className="text-[12px] text-faint">© {new Date().getFullYear()} Aera</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/login" className="text-[12px] text-muted hover:text-ink">{tx("Sign in")}</Link>
            <Link href="/signup" className="text-[12px] text-muted hover:text-ink">{tx("Sign up")}</Link>
            <PrefsSwitch locale={locale} theme={theme} />
          </div>
        </div>
      </footer>
    </div>
  );
}
