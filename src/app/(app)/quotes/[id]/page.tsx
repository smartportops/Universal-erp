import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDay, money, one, qty } from "@/lib/format";
import { translator } from "@/lib/i18n-server";
import { Banner, PageIntro, Panel, buttonClass } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  return { title: quote?.number ?? tx("Quote") };
}

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const quote = await prisma.quote.findFirst({
    where: { id, organizationId: session.organization.id },
    include: { customer: true, lines: true, salesOrder: true },
  });
  if (!quote) notFound();
  return (
    <div>
      <PageIntro
        back={quote.salesOrder ? { href: `/sales-orders/${quote.salesOrderId}`, label: quote.salesOrder.number } : { href: "/sales-orders", label: tx("Orders") }}
        eyebrow={<Link href={`/customers/${quote.customerId}`} className="hover:underline">{quote.customer.name}</Link>}
        title={quote.number}
        badges={<span className="text-[13px] text-muted">{tx("Quote")} · {formatDay(quote.issuedAt)}</span>}
        actions={<a className={buttonClass("secondary")} href={`/api/quotes/${quote.id}/pdf`}>{tx("Download PDF")}</a>}
      />
      <Banner notice={one(query.notice) ? tx(one(query.notice)) : undefined} />
      <Panel flush>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-y border-line bg-subtle text-left text-[12px] text-muted">
              <th className="py-2 pl-6 pr-3 font-medium">{tx("Line")}</th>
              <th className="px-3 py-2 text-right font-medium">{tx("Quantity")}</th>
              <th className="px-3 py-2 text-right font-medium">{tx("Unit price")}</th>
              <th className="py-2 pl-3 pr-6 text-right font-medium">{tx("Total")}</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line) => (
              <tr key={line.id} className="border-b border-line">
                <td className="py-3 pl-6 pr-3">{line.description}</td>
                <td className="px-3 py-3 text-right tabular-nums">{qty(line.quantity)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted">{money(line.unitPriceCents)}</td>
                <td className="py-3 pl-3 pr-6 text-right tabular-nums">{money(line.quantity * line.unitPriceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto max-w-xs space-y-1 px-6 py-4 text-[13px]">
          <div className="flex justify-between text-muted"><dt>{tx("Net")}</dt><dd className="tabular-nums">{money(quote.netCents)}</dd></div>
          <div className="flex justify-between text-muted"><dt>{tx("Tax")}</dt><dd className="tabular-nums">{money(quote.taxCents)}</dd></div>
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>{tx("Grand total")}</dt><dd className="tabular-nums">{money(quote.totalCents)}</dd></div>
        </dl>
      </Panel>
    </div>
  );
}
