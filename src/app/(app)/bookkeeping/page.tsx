import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDay, money } from "@/lib/format";
import { accountTypes } from "@/lib/labels";
import { translator } from "@/lib/i18n-server";
import { PageIntro, Panel, Pill, Stat } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Bookkeeping") };
}

export default async function BookkeepingPage() {
  const tx = await translator();
  const session = await requireUser();
  const [accounts, entries] = await Promise.all([
    prisma.account.findMany({ where: { organizationId: session.organization.id }, include: { lines: true }, orderBy: { code: "asc" } }),
    prisma.journalEntry.findMany({ where: { organizationId: session.organization.id }, include: { lines: true }, orderBy: { entryDate: "desc" }, take: 20 }),
  ]);
  const debit = accounts.reduce((sum, account) => sum + account.lines.reduce((inner, line) => inner + line.debitCents, 0), 0);
  const credit = accounts.reduce((sum, account) => sum + account.lines.reduce((inner, line) => inner + line.creditCents, 0), 0);
  return (
    <div>
      <PageIntro
        title={tx("Bookkeeping")}
        description={tx("Every goods receipt, shipment and payment posts automatically. DATEV export comes later.")}
        badges={debit === credit ? <Pill tone="ok">{tx("Balanced")}</Pill> : <Pill tone="danger">{tx("Difference")}</Pill>}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Stat label={tx("Total debits")} value={money(debit)} />
        <Stat label={tx("Total credits")} value={money(credit)} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title={tx("Accounts")} flush>
          <ul>
            {accounts.map((account) => {
              const balance = account.lines.reduce((sum, line) => sum + line.debitCents - line.creditCents, 0);
              return (
                <li key={account.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-[13px]">
                  <span className="w-12 font-mono text-[12px] text-muted">{account.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{account.name}</span>
                    <span className="text-[12px] text-faint">{tx(accountTypes[account.type] ?? account.type)}</span>
                  </span>
                  <span className={`font-medium tabular-nums ${balance === 0 ? "text-faint" : ""}`}>{money(balance)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title={tx("Latest entries")} flush>
          <ul>
            {entries.map((entry) => {
              const amount = entry.lines.reduce((sum, line) => sum + line.debitCents, 0);
              return (
                <li key={entry.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.memo}</span>
                    <span className="text-[12px] text-faint">{entry.number} · {formatDay(entry.entryDate)}</span>
                  </span>
                  <span className="tabular-nums">{money(amount)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
