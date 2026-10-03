import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { money, one } from "@/lib/format";
import { accountNames } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { annualStatements, type StatementLine } from "@/server/domain/accounting";
import { FinanceTabs, ReportRange } from "@/components/finance-tabs";
import { PageIntro, Panel, Pill } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Annual accounts") };
}

function Rows({ tx, lines }: { tx: (text: string) => string; lines: StatementLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <li key={line.code} className="flex items-center gap-3 border-t border-line px-5 py-2 text-[13px]">
          <span className="w-14 font-mono text-[12px] text-muted">{line.code}</span>
          <span className="min-w-0 flex-1 truncate">{tx(accountNames[line.code] ?? line.name)}</span>
          <span className="tabular-nums">{money(line.amount)}</span>
        </li>
      ))}
    </>
  );
}

function Total({ label, amount }: { label: string; amount: number }) {
  return (
    <li className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px] font-semibold">
      <span>{label}</span>
      <span className="tabular-nums">{money(amount)}</span>
    </li>
  );
}

export default async function StatementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const now = new Date();
  const year = Number(one(query.year)) || now.getUTCFullYear();
  const report = await annualStatements(session.organization.id, year);
  const years = Array.from({ length: 6 }, (_, index) => now.getUTCFullYear() - index);
  return (
    <div>
      <PageIntro
        title={tx("Annual accounts")}
        description={tx("Profit and loss for the year, and the balance sheet on the last day. Prior years stay open, so their result is carried forward and both sides match.")}
        badges={report.balanced ? <Pill tone="ok">{tx("Balanced")}</Pill> : <Pill tone="danger">{tx("Difference")}</Pill>}
        actions={<Link href={`/api/export/statements?year=${year}`} className="inline-flex h-9 items-center rounded-lg bg-surface px-3 text-[13px] font-medium shadow-[var(--shadow-xs)] ring-1 ring-line-strong hover:bg-subtle">{tx("Export")}</Link>}
      />
      <FinanceTabs active="statements" tx={tx} />
      <ReportRange action="/bookkeeping/statements" year={year} years={years} locale={locale} tx={tx} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title={tx("Profit and loss")} description={String(year)} flush>
          <ul>
            <li className="px-5 pb-1 pt-3 text-[12px] font-medium text-muted">{tx("Revenue")}</li>
            <Rows tx={tx} lines={report.revenue} />
            <Total label={tx("Total revenue")} amount={report.revenueTotal} />
            <li className="px-5 pb-1 pt-3 text-[12px] font-medium text-muted">{tx("Expenses")}</li>
            <Rows tx={tx} lines={report.expenses} />
            <Total label={tx("Total expenses")} amount={report.expenseTotal} />
            <Total label={report.result >= 0 ? tx("Profit") : tx("Loss")} amount={report.result} />
          </ul>
        </Panel>
        <Panel title={tx("Balance sheet")} description={tx("At 31 December {year}", { year })} flush>
          <ul>
            <li className="px-5 pb-1 pt-3 text-[12px] font-medium text-muted">{tx("Assets")}</li>
            <Rows tx={tx} lines={report.assets} />
            <Total label={tx("Total assets")} amount={report.assetTotal} />
            <li className="px-5 pb-1 pt-3 text-[12px] font-medium text-muted">{tx("Liabilities")}</li>
            <Rows tx={tx} lines={report.liabilities} />
            <Total label={tx("Total liabilities")} amount={report.liabilityTotal} />
            <li className="px-5 pb-1 pt-3 text-[12px] font-medium text-muted">{tx("Equity")}</li>
            <Rows tx={tx} lines={report.equity} />
            <Total label={tx("Result carried forward")} amount={report.priorResult} />
            <Total label={tx("Result for the year")} amount={report.result} />
            <Total label={tx("Total equity")} amount={report.equityTotal} />
          </ul>
        </Panel>
      </div>
    </div>
  );
}
