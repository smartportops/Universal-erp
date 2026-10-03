import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { money, one } from "@/lib/format";
import { accountNames, accountTypes } from "@/lib/labels";
import { translator } from "@/lib/i18n-server";
import { createAccount } from "@/server/actions/vouchers";
import { FinanceTabs } from "@/components/finance-tabs";
import { Banner, PageIntro, Panel, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Accounts") };
}

function balanceOf(type: string, debit: number, credit: number) {
  return type === "asset" || type === "expense" ? debit - credit : credit - debit;
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const session = await requireUser();
  const query = await searchParams;
  const accounts = await prisma.account.findMany({
    where: { organizationId: session.organization.id },
    include: { lines: true },
    orderBy: { code: "asc" },
  });
  const writable = can(session.role, "finance.write");
  return (
    <div>
      <PageIntro
        title={tx("Accounts")}
        description={tx("A compact chart that works across Europe. Invoices issued here keep posting to receivables, revenue, output VAT and the bank. Add any account you want to use on a voucher.")}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <FinanceTabs active="accounts" tx={tx} />
      <Panel flush>
        <ul>
          {accounts.map((account) => {
            const debit = account.lines.reduce((sum, line) => sum + line.debitCents, 0);
            const credit = account.lines.reduce((sum, line) => sum + line.creditCents, 0);
            const balance = balanceOf(account.type, debit, credit);
            return (
              <li key={account.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-[13px] first:border-0">
                <span className="w-14 font-mono text-[12px] text-muted">{account.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{tx(accountNames[account.code] ?? account.name)}</span>
                  <span className="text-[12px] text-faint">{tx(accountTypes[account.type] ?? account.type)}</span>
                </span>
                <span className={`font-medium tabular-nums ${balance === 0 ? "text-faint" : ""}`}>{money(balance)}</span>
              </li>
            );
          })}
        </ul>
        {writable ? (
          <form action={createAccount} className="grid grid-cols-1 items-center gap-2 border-t border-line bg-subtle px-5 py-3 sm:grid-cols-[7rem_1fr_11rem_auto]">
            <input name="code" required placeholder={tx("Account code")} className={fieldClass} />
            <input name="name" required placeholder={tx("Name")} className={fieldClass} />
            <select name="type" defaultValue="expense" className={fieldClass}>
              {Object.entries(accountTypes).map(([value, label]) => (
                <option key={value} value={value}>{tx(label)}</option>
              ))}
            </select>
            <SubmitButton variant="secondary" size="sm">{tx("Add account")}</SubmitButton>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}
