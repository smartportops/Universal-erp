import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDay, money, one } from "@/lib/format";
import { accountNames } from "@/lib/labels";
import { translator } from "@/lib/i18n-server";
import { voidVoucherAction } from "@/server/actions/vouchers";
import { Banner, PageIntro, Panel, Pill, Properties } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Voucher") };
}

function named(tx: (text: string) => string, account?: { code: string; name: string } | null) {
  if (!account) return "—";
  return `${account.code} ${tx(accountNames[account.code] ?? account.name)}`;
}

export default async function VoucherPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const voucher = await prisma.voucher.findFirst({
    where: { id, organizationId: session.organization.id },
    include: { netAccount: true, taxAccount: true, contraAccount: true },
  });
  if (!voucher) notFound();
  const rate = `${(voucher.taxRateBps / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
  const incoming = voucher.direction === "in";
  return (
    <div>
      <PageIntro
        back={{ href: "/vouchers", label: tx("Vouchers") }}
        title={voucher.number}
        badges={<Pill tone={voucher.status === "void" ? "neutral" : "ok"}>{tx(voucher.status === "void" ? "Voided" : "Booked")}</Pill>}
        description={voucher.counterparty}
        actions={
          voucher.storageKey ? (
            <Link href={`/api/vouchers/${voucher.id}/file`} className="inline-flex h-9 items-center rounded-lg bg-surface px-3 text-[13px] font-medium shadow-[var(--shadow-xs)] ring-1 ring-line-strong hover:bg-subtle">
              {tx("Download file")}
            </Link>
          ) : undefined
        }
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title={tx("Posting")}>
          <Properties
            items={[
              { label: tx("Direction"), value: tx(incoming ? "Incoming voucher" : "Outgoing voucher") },
              { label: tx("Date"), value: formatDay(voucher.issuedAt) },
              { label: tx("Their reference"), value: voucher.reference || "—", hidden: !voucher.reference },
              { label: tx("Tax rate"), value: rate },
              { label: tx("Net"), value: money(voucher.netCents) },
              { label: tx("Tax"), value: money(voucher.taxCents) },
              { label: tx("Gross"), value: money(voucher.totalCents) },
              { label: incoming ? tx("Expense account") : tx("Revenue account"), value: named(tx, voucher.netAccount) },
              { label: tx("Tax account"), value: named(tx, voucher.taxAccount) },
              { label: tx("Contra account"), value: named(tx, voucher.contraAccount) },
              { label: tx("Note"), value: voucher.description || "—", hidden: !voucher.description },
              { label: tx("File"), value: voucher.filename || "—" },
            ]}
          />
          <p className="mt-4 text-[13px] leading-5 text-muted">
            {incoming
              ? tx("Debit {net} and {tax}, credit {contra}.", { net: named(tx, voucher.netAccount), tax: named(tx, voucher.taxAccount), contra: named(tx, voucher.contraAccount) })
              : tx("Debit {contra}, credit {net} and {tax}.", { net: named(tx, voucher.netAccount), tax: named(tx, voucher.taxAccount), contra: named(tx, voucher.contraAccount) })}
          </p>
        </Panel>
        {can(session.role, "finance.write") && voucher.status !== "void" ? (
          <Panel title={tx("Void")} description={tx("Posts the exact reversal. The voucher and its file stay.")}>
            <form action={voidVoucherAction}>
              <input type="hidden" name="id" value={voucher.id} />
              <SubmitButton variant="secondary">{tx("Void voucher")}</SubmitButton>
            </form>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
