import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dayKey, daysFromToday, money } from "@/lib/format";
import { getLocale, translator } from "@/lib/i18n-server";
import { getSnapshot } from "@/server/snapshot";
import { Button } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Overview") };
}

const DAYS = 7;
const W = 700;
const H = 220;
const PAD = 18;

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default async function DashboardPage() {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const snapshot = await getSnapshot(session.organization.id);
  const dateLocale = locale === "de" ? "de-DE" : "en-GB";
  const first = session.user.name.split(" ")[0];
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }).format(now));
  const greeting = hour < 11 ? tx("Good morning") : hour < 18 ? tx("Hello") : tx("Good evening");
  const today = new Intl.DateTimeFormat(dateLocale, { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" }).format(now);

  const live = snapshot.orders.filter((order) => order.status !== "cancelled");
  const total = (order: (typeof live)[number]) => order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  const sumBetween = (from: number, to: number) => {
    const start = dayKey(daysFromToday(from));
    const end = dayKey(daysFromToday(to));
    return live.filter((order) => dayKey(order.orderedAt) >= start && dayKey(order.orderedAt) <= end).reduce((sum, order) => sum + total(order), 0);
  };

  const days = Array.from({ length: DAYS }, (_, index) => {
    const date = daysFromToday(index - (DAYS - 1));
    const key = dayKey(date);
    const orders = live.filter((order) => dayKey(order.orderedAt) === key);
    return {
      key,
      label: index === DAYS - 1 ? tx("Today") : new Intl.DateTimeFormat(dateLocale, { weekday: "short", timeZone: "Europe/Berlin" }).format(date).replace(".", ""),
      date: new Intl.DateTimeFormat(dateLocale, { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Berlin" }).format(date),
      revenue: orders.reduce((sum, order) => sum + total(order), 0),
      count: orders.length,
    };
  });
  const revenue = days.reduce((sum, day) => sum + day.revenue, 0);
  const previous = sumBetween(-(DAYS * 2 - 1), -DAYS);
  const change = previous > 0 ? Math.round(((revenue - previous) / previous) * 100) : null;
  const orderCount = days.reduce((sum, day) => sum + day.count, 0);

  const peak = Math.max(1, ...days.map((day) => day.revenue)) * 1.15;
  const points = days.map((day, index) => ({
    x: ((index + 0.5) / DAYS) * W,
    y: H - PAD - (day.revenue / peak) * (H - PAD * 2),
  }));
  const line = smoothPath(points);
  const area = `${line} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`;

  const openInvoices = snapshot.invoiceRows.filter((invoice) => ["issued", "partial"].includes(invoice.status) && invoice.open > 0);
  const kpis = [
    { label: tx("Open orders"), value: String(snapshot.kpis.openOrders), hint: tx("Waiting to ship"), href: "/sales-orders?view=open" },
    { label: tx("Unpaid invoices"), value: money(snapshot.kpis.unpaid), hint: tx("{n} invoices · {m} overdue", { n: openInvoices.length, m: snapshot.overdueInvoices.length }), href: "/invoices?view=open" },
    { label: tx("Low stock"), value: String(snapshot.reorder.length), hint: tx("Below reorder point"), href: "/reorder" },
    { label: tx("Late orders"), value: String(snapshot.kpis.lateOrders), hint: tx("Past the promised date"), href: "/sales-orders?view=late" },
  ];

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] text-muted">{today}</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em]">
            {greeting}, {first}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(session.role, "sales.write") ? (
            <Button href="/customers/new" variant="secondary">
              <Plus size={14} /> {tx("Customer")}
            </Button>
          ) : null}
          {can(session.role, "catalog.write") ? (
            <Button href="/products/new" variant="secondary">
              <Plus size={14} /> {tx("Product")}
            </Button>
          ) : null}
          {can(session.role, "sales.write") ? (
            <Button href="/sales-orders/new">
              <Plus size={14} /> {tx("Order")}
            </Button>
          ) : null}
        </div>
      </div>

      <section className="rounded-2xl bg-surface p-6 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[13px] text-muted">{tx("Revenue, last 7 days")}</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-[34px] font-semibold tracking-[-0.03em] tabular-nums">{money(revenue)}</span>
              {change !== null ? (
                <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-medium ${change >= 0 ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
                  {change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {Math.abs(change)}%
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-[12px] text-faint">
              {tx("{n} orders · vs. {amount} the 7 days before", { n: orderCount, amount: money(previous) })}
            </div>
          </div>
          <Link href="/reports" className="rounded-lg px-2.5 py-1 text-[13px] text-muted ring-1 ring-line hover:text-ink">
            {tx("Reports")}
          </Link>
        </div>

        <div className="relative mt-6 h-[220px]">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line key={ratio} x1="0" x2={W} y1={H * ratio} y2={H * ratio} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
            ))}
            <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
            <path d={area} fill="url(#revenueFill)" />
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="absolute inset-0 flex">
            {days.map((day, index) => {
              const top = (points[index].y / H) * 100;
              const last = index === DAYS - 1;
              return (
                <div key={day.key} className="group relative flex-1">
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line-strong opacity-0 transition group-hover:opacity-100" />
                  <span
                    className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow-[var(--shadow)] transition ${last ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                    style={{ top: `${top}%` }}
                  />
                  <div
                    className="pointer-events-none absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-primary px-2.5 py-1.5 text-center text-primary-ink shadow-[var(--shadow-lg)] group-hover:block"
                    style={{ top: `calc(${top}% - 58px)` }}
                  >
                    <div className="text-[11px] opacity-70">{day.date}</div>
                    <div className="text-[13px] font-semibold tabular-nums">{money(day.revenue)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex">
          {days.map((day, index) => (
            <span key={day.key} className={`flex-1 text-center text-[12px] ${index === DAYS - 1 ? "font-medium text-ink" : "text-faint"}`}>
              {day.label}
            </span>
          ))}
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow)] lg:grid-cols-4 lg:divide-y-0">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="group px-6 py-5 transition-colors hover:bg-ink/[0.025]">
            <div className="text-[13px] text-muted">{kpi.label}</div>
            <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{kpi.value}</div>
            <div className="mt-2 text-[12px] leading-4 text-faint">{kpi.hint}</div>
          </Link>
        ))}
      </div>

    </div>
  );
}
