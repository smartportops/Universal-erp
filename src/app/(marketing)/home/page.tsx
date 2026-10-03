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
  Receipt,
  ScrollText,
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
const eyebrow = "text-[13px] font-medium text-accent";
const h2 = "mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[42px]";
const lede = "mt-4 text-[16px] leading-7 text-muted";
const card = "relative overflow-hidden rounded-2xl bg-surface ring-1 ring-line";

function Shot({ src, alt, className = "", zoom = 1, shift = [0, 0] }: { src: string; alt: string; className?: string; zoom?: number; shift?: [number, number] }) {
  return (
    <div className={`overflow-hidden rounded-tl-xl border-l border-t border-line bg-bg shadow-[var(--shadow-lg)] ${className}`}>
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={760}
        sizes="(min-width: 1120px) 720px, 100vw"
        className="h-auto max-w-none"
        style={{ width: `${zoom * 100}%`, transform: `translate(${shift[0]}%, ${shift[1]}%)` }}
      />
    </div>
  );
}

export default async function HomePage() {
  const [tx, locale, theme] = await Promise.all([translator(), getLocale(), getTheme()]);

  const flow = [
    { icon: ShoppingCart, tone: "bg-soft text-accent", title: "Order comes in", body: "From your shop, a marketplace or typed in by hand." },
    { icon: Truck, tone: "bg-info-soft text-info", title: "Picked and shipped", body: "Stock leaves the ledger, the carrier label is on the shipment." },
    { icon: Receipt, tone: "bg-warning-soft text-warning", title: "Invoice issued", body: "Net, tax and total in integer cents. Due date from the customer's terms." },
    { icon: BookOpenText, tone: "bg-ok-soft text-ok", title: "Journal posted", body: "Revenue, receivables and VAT booked. Nothing to do by hand." },
  ];

  const trust = [
    { icon: Users, tone: "bg-soft text-accent", title: "Your own company", body: "Every registration creates a separate organization. Nobody else can see your data." },
    { icon: KeyRound, tone: "bg-info-soft text-info", title: "Roles and 2FA", body: "Owner, operations, warehouse, finance and view-only roles. Optional authenticator codes." },
    { icon: ScrollText, tone: "bg-warning-soft text-warning", title: "Audit trail", body: "Every change is recorded with who, what and when. The timeline is for the team, the audit is for proof." },
    { icon: Globe, tone: "bg-ok-soft text-ok", title: "Hosted in the EU", body: "Application and database run in the Netherlands. Data stays in Europe." },
  ];

  const ledger = [
    { sku: "HEM-KAT-M", label: "Goods receipt", ref: "PO-2041", qty: "+120", tone: "text-ok" },
    { sku: "HEM-KAT-M", label: "Shipment", ref: "SO-10052", qty: "-20", tone: "text-danger" },
    { sku: "WOL-ARV-NAT", label: "Transfer", ref: "BER → HAM", qty: "-12", tone: "text-danger" },
    { sku: "WOL-ARV-NAT", label: "Transfer", ref: "BER → HAM", qty: "+12", tone: "text-ok" },
    { sku: "KER-HOL-WEI", label: "Count", ref: "A-01-01", qty: "+3", tone: "text-ok" },
  ];

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            <a href="#product" className={navLink}>{tx("Features")}</a>
            <a href="#flow" className={navLink}>{tx("How it works")}</a>
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
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(80,70,229,0.16),transparent_70%)]" />
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(17,17,20,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,17,20,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)]" />
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

          <div className="mx-auto max-w-[1120px] px-6">
            <div className="relative rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-lg)] ring-1 ring-line">
              <div className="relative aspect-[1440/780] overflow-hidden rounded-[12px] ring-1 ring-line">
                <Image src="/marketing/overview.png" alt={tx("The Aera overview with revenue, open orders, unpaid invoices and low stock.")} fill priority sizes="(min-width: 1120px) 1096px, 100vw" className="object-cover object-top dark:hidden" />
                <Image src="/marketing/overview-dark.png" alt="" fill sizes="(min-width: 1120px) 1096px, 100vw" className="hidden object-cover object-top dark:block" />
              </div>
            </div>
          </div>
        </section>

        {/* Proof strip */}
        <section className="mx-auto max-w-[1120px] px-6 py-20">
          <dl className="grid gap-px overflow-hidden rounded-2xl bg-line ring-1 ring-line sm:grid-cols-3">
            {[
              ["0", "floats", "Money is never a float. Totals, taxes and journals add up to the cent."],
              ["1", "ledger", "Stock is a history of movements, so every balance can be explained."],
              ["100 %", "audited", "Each edit leaves an entry with actor and timestamp. Nothing disappears."],
            ].map(([big, small, body]) => (
              <div key={small} className="bg-surface p-6">
                <dt className="flex items-baseline gap-2">
                  <span className="text-[32px] font-semibold tracking-[-0.04em]">{big}</span>
                  <span className="text-[14px] font-medium text-muted">{tx(small)}</span>
                </dt>
                <dd className="mt-1.5 text-[13px] leading-6 text-muted">{tx(body)}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Bento */}
        <section id="product" className="mx-auto max-w-[1120px] scroll-mt-24 px-6 pb-24">
          <div className="max-w-[640px]">
            <p className={eyebrow}>{tx("Everything a store runs on")}</p>
            <h2 className={h2}>{tx("The whole operation, in one calm interface.")}</h2>
            <p className={lede}>{tx("Every module hangs off the same products, customers and warehouses. Ship an order and the stock, invoice and journal move with it.")}</p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {/* Catalog: wide with screenshot */}
            <div className={`${card} lg:col-span-2`}>
              <div className="p-6 pb-0">
                <div className="flex items-center gap-2 text-[13px] font-medium text-accent"><Package className="h-4 w-4" strokeWidth={1.75} /> {tx("Catalog")}</div>
                <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">{tx("Products, variants, prices and stock in one list.")}</h3>
                <p className="mt-1.5 max-w-[520px] text-[13px] leading-6 text-muted">{tx("SKUs, EANs, images and suppliers. Low and negative stock are flagged where you look anyway. Edit inline, save once.")}</p>
              </div>
              <div className="relative mt-6 h-[300px] pl-6">
                <Shot src="/marketing/products.png" alt={tx("The products list")} className="absolute inset-y-0 left-6 right-0" zoom={1.15} />
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface to-transparent" />
              </div>
            </div>

            {/* Inventory ledger mock */}
            <div className={card}>
              <div className="p-6 pb-0">
                <div className="flex items-center gap-2 text-[13px] font-medium text-accent"><Boxes className="h-4 w-4" strokeWidth={1.75} /> {tx("Inventory")}</div>
                <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">{tx("An append-only stock ledger.")}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted">{tx("On hand is always the sum of movements, never a stale number.")}</p>
              </div>
              <div className="relative mt-6 h-[300px]">
                <ul className="absolute inset-x-6 top-0 divide-y divide-line overflow-hidden rounded-t-xl border-x border-t border-line bg-bg text-[12px]">
                  {ledger.map((row, index) => (
                    <li key={index} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block font-mono text-[11px] text-ink">{row.sku}</span>
                        <span className="block truncate text-[11px] text-muted">{tx(row.label)} · {row.ref}</span>
                      </span>
                      <span className={`font-medium tabular-nums ${row.tone}`}>{row.qty}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between bg-surface px-3 py-2.5">
                    <span className="text-[11px] font-medium text-muted">{tx("On hand")}</span>
                    <span className="font-semibold tabular-nums">103</span>
                  </li>
                </ul>
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface to-transparent" />
              </div>
            </div>

            {/* Orders: screenshot */}
            <div className={card}>
              <div className="p-6 pb-0">
                <div className="flex items-center gap-2 text-[13px] font-medium text-accent"><ShoppingCart className="h-4 w-4" strokeWidth={1.75} /> {tx("Orders")}</div>
                <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">{tx("Pick, ship, invoice. Same page.")}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted">{tx("Every channel in one queue, with the next step always one click away.")}</p>
              </div>
              <div className="relative mt-6 h-[260px] pl-6">
                <Shot src="/marketing/order.png" alt={tx("An order with its progress steps")} className="absolute inset-y-0 left-6 right-0" zoom={2} shift={[0, -4]} />
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface to-transparent" />
              </div>
            </div>

            {/* Finance KPI mock */}
            <div className={card}>
              <div className="p-6 pb-0">
                <div className="flex items-center gap-2 text-[13px] font-medium text-accent"><FileText className="h-4 w-4" strokeWidth={1.75} /> {tx("Finance")}</div>
                <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">{tx("Invoices, payments and the books.")}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted">{tx("Issue, settle, dun. Journal entries post themselves.")}</p>
              </div>
              <div className="relative mt-6 h-[260px] px-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-bg p-4 ring-1 ring-line">
                    <div className="text-[11px] text-muted">{tx("Revenue, 7 days")}</div>
                    <div className="mt-1 text-[20px] font-semibold tracking-[-0.03em] tabular-nums">35.450 €</div>
                    <div className="mt-1 inline-flex items-center rounded-md bg-ok-soft px-1.5 py-0.5 text-[11px] font-medium text-ok">↗ 4 %</div>
                  </div>
                  <div className="rounded-xl bg-bg p-4 ring-1 ring-line">
                    <div className="text-[11px] text-muted">{tx("Unpaid invoices")}</div>
                    <div className="mt-1 text-[20px] font-semibold tracking-[-0.03em] tabular-nums">28.415 €</div>
                    <div className="mt-1 inline-flex items-center rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">2 {tx("overdue")}</div>
                  </div>
                </div>
                <svg viewBox="0 0 320 90" className="mt-4 h-[90px] w-full" aria-hidden>
                  <defs>
                    <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#5046e5" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#5046e5" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 24 C 40 10, 60 70, 100 56 S 160 28, 200 40 S 260 20, 320 64 L 320 90 L 0 90 Z" fill="url(#spark)" />
                  <path d="M0 24 C 40 10, 60 70, 100 56 S 160 28, 200 40 S 260 20, 320 64" fill="none" stroke="#5046e5" strokeWidth="2" />
                </svg>
              </div>
            </div>

            {/* Purchasing mock */}
            <div className={card}>
              <div className="p-6 pb-0">
                <div className="flex items-center gap-2 text-[13px] font-medium text-accent"><Truck className="h-4 w-4" strokeWidth={1.75} /> {tx("Purchasing")}</div>
                <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.02em]">{tx("Reorder before you run out.")}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted">{tx("Suggestions from reorder points, lead times and open orders. One click to a purchase order.")}</p>
              </div>
              <div className="relative mt-6 h-[260px] px-6">
                <div className="rounded-xl bg-bg p-4 ring-1 ring-line">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium">Näherei Kato</span>
                    <span className="rounded-md bg-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">{tx("{n} items", { n: 2 })}</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-[12px]">
                    <li className="flex items-center justify-between"><span className="font-mono text-[11px]">HEM-KAT-M</span><span className="text-muted">20 → 60</span><span className="font-medium tabular-nums">+120</span></li>
                    <li className="flex items-center justify-between"><span className="font-mono text-[11px]">HEM-KAT-L</span><span className="text-muted">35 → 60</span><span className="font-medium tabular-nums">+80</span></li>
                  </ul>
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                    <span className="text-[11px] text-muted">{tx("Lead time {n} days", { n: 21 })}</span>
                    <span className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-ink">{tx("Create purchase order")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Flow */}
        <section id="flow" className="scroll-mt-24 border-y border-line bg-surface">
          <div className="mx-auto max-w-[1120px] px-6 py-24">
            <div className="max-w-[640px]">
              <p className={eyebrow}>{tx("How it works")}</p>
              <h2 className={h2}>{tx("One action. Everything moves.")}</h2>
              <p className={lede}>{tx("Shipping an order is one click. Stock, invoice and bookkeeping follow on their own, and every step stays traceable.")}</p>
            </div>
            <ol className="relative mt-12 grid gap-6 md:grid-cols-4">
              <div aria-hidden className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent md:block" />
              {flow.map((step, index) => (
                <li key={step.title} className="relative">
                  <div className={`relative z-10 grid h-12 w-12 place-items-center rounded-xl ring-4 ring-surface ${step.tone}`}>
                    <step.icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="mt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{tx("Step {n}", { n: index + 1 })}</div>
                  <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.01em]">{tx(step.title)}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-muted">{tx(step.body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Assistant on dark */}
        <section id="assistant" className="relative scroll-mt-24 overflow-hidden bg-[#0b0b10] text-white">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_80%_20%,rgba(80,70,229,0.35),transparent_70%),radial-gradient(40%_50%_at_10%_90%,rgba(80,70,229,0.18),transparent_70%)]" />
          <div className="relative mx-auto grid max-w-[1120px] items-center gap-12 px-6 py-24 lg:grid-cols-2">
            <div>
              <p className="text-[13px] font-medium text-[#a5a0ff]">{tx("Assistant")}</p>
              <h2 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[42px]">{tx("Ask your company a question.")}</h2>
              <p className="mt-4 text-[16px] leading-7 text-white/65">
                {tx("The assistant reads the same data as every page: late orders, negative stock, overdue invoices, what to reorder. It answers with numbers and links, not guesses.")}
              </p>
              <ul className="mt-8 space-y-3">
                {["Which orders are late?", "What should I reorder from Näherei Kato?", "How much is still open with Studio Nord?", "Explain HEM-KAT-M"].map((q) => (
                  <li key={q} className="flex items-center gap-3 text-[14px] text-white/80">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/10 ring-1 ring-white/10"><Sparkles className="h-3.5 w-3.5 text-[#a5a0ff]" /></span>
                    {tx(q)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/10 backdrop-blur">
              <div className="rounded-[12px] bg-[#131318] p-5 ring-1 ring-white/10">
                <div className="flex items-center gap-2 text-[12px] text-white/50">
                  <Sparkles className="h-3.5 w-3.5" />
                  {tx("Assistant")}
                  <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/70">⌘J</span>
                </div>
                <div className="mt-5 flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[13px] text-[#111114]">{tx("Which orders are late?")}</div>
                </div>
                <div className="mt-3 max-w-[92%] rounded-2xl rounded-bl-md bg-white/[0.06] px-4 py-3 text-[13px] leading-6 text-white/90 ring-1 ring-white/10">
                  {tx("2 late orders.")}
                  <ul className="mt-1 space-y-1 text-white/60">
                    <li><span className="font-mono text-white">SO-10043</span> · Nordlicht Studio · {tx("promised {n} days ago", { n: 2 })}</li>
                    <li><span className="font-mono text-white">SO-10039</span> · Kaya Home · {tx("promised {n} days ago", { n: 4 })}</li>
                  </ul>
                  <p className="mt-2 text-white/60">{tx("Both are picked and waiting for a carrier label.")}</p>
                </div>
                <div className="mt-5 flex h-10 items-center rounded-lg bg-white/[0.04] px-3 text-[13px] text-white/40 ring-1 ring-white/10">{tx("Ask anything about your company…")}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Inbox + principles */}
        <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 py-24 lg:grid-cols-2">
          <div className={`${card} order-2 h-[420px] lg:order-1`}>
            <Shot src="/marketing/inbox.png" alt={tx("The inbox with notices grouped by day")} className="absolute inset-y-0 left-6 right-0 top-6" zoom={1.35} shift={[-2, -2]} />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface to-transparent" />
          </div>
          <div className="order-1 lg:order-2">
            <p className={eyebrow}>{tx("Inbox")}</p>
            <h2 className={h2}>{tx("What needs you, before you go looking.")}</h2>
            <p className={lede}>{tx("Negative stock, late orders, overdue invoices and reorders land in one inbox, grouped by day. The second tab is for your team's notes and tasks.")}</p>
            <ul className="mt-8 space-y-3">
              {[
                "One source of truth. The dashboard, reports and exports read the same numbers.",
                "Everything is editable in place. No modal mazes, no separate edit screens.",
                "Fast by default. Server-rendered pages, keyboard first, command palette on every screen.",
                "Two languages, light and dark. Switch per user, not per company.",
              ].map((line) => (
                <li key={line} className="flex gap-3 text-[14px] leading-6 text-muted">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-ok" strokeWidth={2} />
                  <span>{tx(line)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="scroll-mt-24 border-y border-line bg-surface">
          <div className="mx-auto max-w-[1120px] px-6 py-24">
            <div className="max-w-[640px]">
              <p className={eyebrow}>{tx("Security")}</p>
              <h2 className={h2}>{tx("Your company, your data.")}</h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {trust.map((item) => (
                <div key={item.title} className="rounded-2xl bg-bg p-6 ring-1 ring-line">
                  <div className={`grid h-10 w-10 place-items-center rounded-xl ${item.tone}`}>
                    <item.icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.01em]">{tx(item.title)}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-muted">{tx(item.body)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="relative scroll-mt-24 overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[520px] bg-[radial-gradient(50%_60%_at_50%_100%,rgba(80,70,229,0.14),transparent_70%)]" />
          <div className="mx-auto max-w-[1120px] px-6 py-24">
            <div className="mx-auto max-w-[520px] text-center">
              <p className={eyebrow}>{tx("Pricing")}</p>
              <h2 className={h2}>{tx("Free during the beta.")}</h2>
              <p className={lede}>{tx("Use every module with your whole team. Pricing comes with the public launch, and beta companies keep a discount.")}</p>
            </div>
            <div className="mx-auto mt-10 max-w-[440px] rounded-[20px] bg-gradient-to-b from-accent/40 via-line to-line p-px shadow-[var(--shadow-lg)]">
              <div className="rounded-[19px] bg-surface p-8">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-muted">{tx("Beta")}</span>
                  <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-accent">{tx("Everything included")}</span>
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[48px] font-semibold tracking-[-0.04em]">0 €</span>
                  <span className="text-[13px] text-muted">/ {tx("month")}</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {["All modules", "Unlimited users and roles", "Two-factor sign-in", "CSV import and export", "REST API and webhooks", "Hosted in the EU"].map((line) => (
                    <li key={line} className="flex items-center gap-2.5 text-[14px] text-ink">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-ok-soft"><Check className="h-3 w-3 text-ok" strokeWidth={2.5} /></span>
                      {tx(line)}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className={`${primary} mt-8 w-full`}>
                  {tx("Create your company")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1120px] px-6 pb-24">
          <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-20 text-center text-primary-ink">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_120%,rgba(80,70,229,0.55),transparent_70%)]" />
            <div className="relative">
              <h2 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[44px]">{tx("Set up your company in two minutes.")}</h2>
              <p className="mx-auto mt-4 max-w-[480px] text-[16px] leading-7 text-primary-ink/70">
                {tx("A name, an email and a password. Your warehouse, tax rates and number ranges are ready when you land.")}
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/signup" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary-ink px-4 text-[14px] font-medium text-ink transition-opacity hover:opacity-90">
                  {tx("Sign up")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-full px-4 text-[14px] font-medium text-primary-ink/80 ring-1 ring-primary-ink/20 transition-colors hover:bg-primary-ink/10">
                  {tx("Sign in")}
                </Link>
              </div>
            </div>
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
