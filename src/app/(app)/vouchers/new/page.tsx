import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { todayKey } from "@/lib/format";
import { translator } from "@/lib/i18n-server";
import { VoucherForm } from "@/components/voucher-form";
import { PageIntro, Panel } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Upload voucher") };
}

function byCode(accounts: { id: string; code: string }[], code: string) {
  return accounts.find((account) => account.code === code)?.id ?? accounts[0]?.id ?? "";
}

export default async function NewVoucherPage() {
  const tx = await translator();
  const session = await requireUser();
  const [accounts, taxes, customers, suppliers] = await Promise.all([
    prisma.account.findMany({ where: { organizationId: session.organization.id }, orderBy: { code: "asc" } }),
    prisma.taxRate.findMany({ where: { organizationId: session.organization.id }, orderBy: { rateBps: "desc" } }),
    prisma.customer.findMany({ where: { organizationId: session.organization.id }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { organizationId: session.organization.id }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const parties = [...new Set([...suppliers.map((item) => item.name), ...customers.map((item) => item.name)])];
  return (
    <div>
      <PageIntro
        back={{ href: "/vouchers", label: tx("Vouchers") }}
        title={tx("Upload voucher")}
        description={tx("The gross amount is split by the tax rate and posted to the accounts you pick. A booked voucher is corrected by voiding it, which posts the reversal.")}
      />
      <Panel>
        <VoucherForm
          accounts={accounts.map((account) => ({ id: account.id, code: account.code, name: account.name, type: account.type }))}
          taxes={taxes.map((tax) => ({ name: tax.name, rateBps: tax.rateBps, isDefault: tax.isDefault }))}
          parties={parties}
          today={todayKey()}
          defaults={{
            in: { net: byCode(accounts, "5000"), tax: byCode(accounts, "1570"), contra: byCode(accounts, "3300") },
            out: { net: byCode(accounts, "4000"), tax: byCode(accounts, "3800"), contra: byCode(accounts, "1400") },
          }}
        />
      </Panel>
    </div>
  );
}
