import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { money, qty } from "@/lib/format";
import { channels } from "@/lib/labels";
import { translator } from "@/lib/i18n-server";
import { getSnapshot } from "@/server/snapshot";
import { PageIntro, Panel, Stat, Thumb } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Reports") };
}

export default async function ReportsPage() {
  const tx = await translator();
  const session = await requireUser();
  const snapshot = await getSnapshot(session.organization.id);
  const mix = snapshot.channelMix.filter((item) => item.count > 0);
  const max = Math.max(...mix.map((item) => item.count), 1);
  const topValue = [...snapshot.balances].sort((a, b) => Math.max(b.onHand, 0) * b.costCents - Math.max(a.onHand, 0) * a.costCents).slice(0, 6);
  return (
    <div>
      <PageIntro title={tx("Reports")} description={tx("The same numbers as the overview. No second source of truth.")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={tx("Revenue this month")} value={money(snapshot.kpis.revenueMonth)} hint={tx("net, from invoices")} />
        <Stat label={tx("Stock value")} value={money(snapshot.kpis.stockValue)} hint={tx("positive stock at cost")} />
        <Stat label={tx("Open items")} value={money(snapshot.kpis.unpaid)} hint={tx("issued, unpaid invoices")} />
      </div>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Panel title={tx("Orders by channel")} description={tx("This month")}>
          <div className="space-y-3">
            {mix.map((item) => (
              <div key={item.channel}>
                <div className="mb-1 flex justify-between text-[13px]"><span>{tx(channels[item.channel] ?? item.channel)}</span><span className="font-medium tabular-nums">{item.count}</span></div>
                <div className="h-2 rounded-full bg-[#f2f2f5]"><div className="h-2 rounded-full bg-accent" style={{ width: `${(item.count / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={tx("Highest stock value")} flush>
          <ul>
            {topValue.map((row) => (
              <li key={row.variantId}>
                <Link href={`/products/${row.productId}`} className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-[13px] hover:bg-subtle">
                  <Thumb label={row.productName} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.productName}</span>
                    <span className="font-mono text-[12px] text-muted">{row.sku} · {tx("{n} pcs.", { n: qty(row.onHand) })}</span>
                  </span>
                  <span className="font-medium tabular-nums">{money(Math.max(row.onHand, 0) * row.costCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
