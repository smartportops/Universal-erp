import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDay, one, qty } from "@/lib/format";
import { dispositions, returnStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { receiveReturnAction, refundReturnAction } from "@/server/actions/orders";
import { entityExtras } from "@/server/entity";
import { ActivityFeed, DetailLayout } from "@/components/entity-panel";
import { Banner, PageIntro, Panel, Pill, Properties, Status, Thumb } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const entry = await prisma.return.findUnique({ where: { id } });
  return { title: entry?.number ?? tx("Return") };
}

export default async function ReturnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const entry = await prisma.return.findFirst({
    where: { id, organizationId: session.organization.id },
    include: { customer: true, salesOrder: true, lines: { include: { variant: { include: { product: true } } } } },
  });
  if (!entry) notFound();
  const extras = await entityExtras(session.organization.id, "return", entry.id);
  const canReceive = can(session.role, "stock.write") && ["requested", "approved"].includes(entry.status);
  const canRefund = can(session.role, "finance.write") && entry.status === "received";
  void locale;
  return (
    <div>
      <PageIntro
        back={{ href: "/returns", label: tx("Returns") }}
        eyebrow={<Link href={`/sales-orders/${entry.salesOrderId}`} className="hover:text-ink hover:underline">{entry.salesOrder.number} · {entry.customer.name}</Link>}
        title={entry.number}
        badges={<Status map={txMap(returnStatus, tx)} value={entry.status} />}
        actions={
          <>
            {canReceive ? (
              <form action={receiveReturnAction}><input type="hidden" name="id" value={entry.id} /><SubmitButton>{tx("Receive")}</SubmitButton></form>
            ) : null}
            {canRefund ? (
              <form action={refundReturnAction}><input type="hidden" name="id" value={entry.id} /><SubmitButton>{tx("Refund")}</SubmitButton></form>
            ) : null}
          </>
        }
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <DetailLayout
        side={
          <Panel title={tx("Details")}>
            <Properties
              items={[
                { label: tx("Customer"), value: <Link href={`/customers/${entry.customerId}`} className="hover:underline">{entry.customer.name}</Link> },
                { label: tx("Order"), value: <Link href={`/sales-orders/${entry.salesOrderId}`} className="hover:underline">{entry.salesOrder.number}</Link> },
                { label: tx("Requested"), value: formatDay(entry.createdAt) },
                { label: tx("Reason"), value: entry.reason },
              ]}
            />
          </Panel>
        }
      >
        <Panel title={tx("Items")} flush>
          <ul>
            {entry.lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 border-t border-line px-5 py-3 text-[13px]">
                <Thumb label={line.variant.product.name} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{line.variant.product.name}</span>
                  <span className="font-mono text-[12px] text-muted">{line.variant.sku}</span>
                </span>
                <Pill tone={line.disposition === "restock" ? "ok" : line.disposition === "scrap" ? "neutral" : "warning"}>{tx(dispositions[line.disposition] ?? line.disposition)}</Pill>
                <span className="w-16 text-right font-medium tabular-nums">{tx("{n} pcs", { n: qty(line.quantity) })}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <ActivityFeed entityType="return" entityId={entry.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/returns/${entry.id}`} />
      </DetailLayout>
    </div>
  );
}
