import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { money, one } from "@/lib/format";
import { getLocale, translator } from "@/lib/i18n-server";
import { periodRange } from "@/lib/period";
import { vatReturn } from "@/server/domain/accounting";
import { FinanceTabs, ReportRange } from "@/components/finance-tabs";
import { Banner, PageIntro, Panel, Stat } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("VAT return") };
}

function rateLabel(bps: number) {
  return `${(bps / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
}

export default async function VatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const now = new Date();
  const year = Number(one(query.year)) || now.getUTCFullYear();
  const period = one(query.period) || `m${now.getUTCMonth() + 1}`;
  const { from, to } = periodRange(year, period);
  const report = await vatReturn(session.organization.id, from, to);
  const years = Array.from({ length: 6 }, (_, index) => now.getUTCFullYear() - index);
  const exportHref = `/api/export/vat?year=${year}&period=${encodeURIComponent(period)}`;
  const differs = report.bookedOutput !== report.outTax || report.bookedInput !== report.inTax;
  return (
    <div>
      <PageIntro
        title={tx("VAT return")}
        description={tx("Output VAT from invoices and outgoing vouchers, input VAT from incoming vouchers, split by the rate on each document. The same sheet works for any European rate you keep in settings.")}
        actions={<Link href={exportHref} className="inline-flex h-9 items-center rounded-lg bg-surface px-3 text-[13px] font-medium shadow-[var(--shadow-xs)] ring-1 ring-line-strong hover:bg-subtle">{tx("Export")}</Link>}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <FinanceTabs active="vat" tx={tx} />
      <ReportRange action="/bookkeeping/vat" year={year} years={years} period={period} locale={locale} tx={tx} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label={tx("Output VAT")} value={money(report.outTax)} hint={tx("Net {amount}", { amount: money(report.outNet) })} />
        <Stat label={tx("Input VAT")} value={money(report.inTax)} hint={tx("Net {amount}", { amount: money(report.inNet) })} />
        <Stat label={report.payable >= 0 ? tx("VAT payable") : tx("VAT refund")} value={money(Math.abs(report.payable))} tone={report.payable > 0 ? "warning" : undefined} />
      </div>
      <Panel flush>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-y border-line bg-subtle text-left text-[12px] text-muted">
              <th className="py-2 pl-5 pr-3 font-medium">{tx("Tax rate")}</th>
              <th className="px-3 py-2 text-right font-medium">{tx("Output net")}</th>
              <th className="px-3 py-2 text-right font-medium">{tx("Output VAT")}</th>
              <th className="px-3 py-2 text-right font-medium">{tx("Input net")}</th>
              <th className="py-2 pl-3 pr-5 text-right font-medium">{tx("Input VAT")}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">{tx("Nothing in this period.")}</td></tr>
            ) : report.rows.map((row) => (
              <tr key={row.rateBps} className="border-b border-line last:border-0">
                <td className="py-2.5 pl-5 pr-3 font-medium">{rateLabel(row.rateBps)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(row.outNet)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(row.outTax)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(row.inNet)}</td>
                <td className="py-2.5 pl-3 pr-5 text-right tabular-nums">{money(row.inTax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <p className="mt-3 text-[12px] leading-5 text-muted">
        {tx("Posted on the VAT accounts in this period: output {output} on 3800, input {input} on 1570.", { output: money(report.bookedOutput), input: money(report.bookedInput) })}
        {differs ? ` ${tx("A difference means a posting used another tax account, or a manual journal.")}` : ""}
      </p>
      <p className="mt-1 text-[12px] text-muted">
        <Link href="/settings?section=taxes" className="text-accent hover:underline">{tx("Tax rates")}</Link>
      </p>
    </div>
  );
}
