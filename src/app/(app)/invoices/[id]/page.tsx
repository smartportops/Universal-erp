import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { centsToInput, dayKey, formatDay, money, one, qty, todayKey } from "@/lib/format";
import { invoiceKinds, invoiceStatus, paymentMethods } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { invoiceOpenAmount } from "@/lib/invoices";
import { cancelCreditNote, cancelInvoice, correctInvoice, payInvoice } from "@/server/actions/finance";
import { buttonClass } from "@/components/ui";
import { entityExtras } from "@/server/entity";
import { ActivityFeed, DetailLayout } from "@/components/entity-panel";
import { Banner, PageIntro, Panel, Pill, Properties, Status, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  return { title: invoice?.number ?? tx("Invoice") };
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: session.organization.id },
    include: { customer: true, lines: true, payments: { orderBy: { paidAt: "desc" } }, salesOrder: true, corrects: true, correctedBy: { orderBy: { createdAt: "desc" } } },
  });
  if (!invoice) notFound();
  const extras = await entityExtras(session.organization.id, "invoice", invoice.id);
  const credited = invoice.correctedBy.filter((entry) => entry.kind === "credit" && !["cancelled", "void"].includes(entry.status)).reduce((sum, entry) => sum + entry.totalCents, 0);
  const paid = invoice.payments.filter((payment) => payment.status === "settled").reduce((sum, payment) => sum + payment.amountCents, 0);
  const open = invoiceOpenAmount(invoice, credited);
  const overdue = open > 0 && !!invoice.dueAt && dayKey(invoice.dueAt) < todayKey();
  const finance = can(session.role, "finance.write");
  const canPay = finance && open > 0;
  const live = !["cancelled", "void"].includes(invoice.status);
  void locale;

  return (
    <div>
      <PageIntro
        back={{ href: "/invoices", label: tx("Invoices") }}
        eyebrow={<Link href={`/customers/${invoice.customerId}`} className="hover:text-ink hover:underline">{invoice.customer.name}</Link>}
        title={invoice.number}
        badges={
          <>
            <Pill>{tx(invoiceKinds[invoice.kind] ?? invoice.kind)}</Pill>
            <Status map={txMap(invoiceStatus, tx)} value={invoice.status} />
            {overdue ? <Pill tone="danger">{tx("Overdue")}</Pill> : null}
          </>
        }
        actions={
          <>
            <a className={buttonClass("secondary")} href={`/api/invoices/${invoice.id}/pdf`}>{tx("Download PDF")}</a>
            {finance && live && invoice.kind === "invoice" ? (
              <>
                <form action={correctInvoice}><input type="hidden" name="id" value={invoice.id} /><SubmitButton variant="secondary">{tx("Create credit note")}</SubmitButton></form>
                <form action={cancelInvoice}><input type="hidden" name="id" value={invoice.id} /><SubmitButton variant="danger">{tx("Create cancellation invoice")}</SubmitButton></form>
              </>
            ) : null}
            {finance && live && invoice.kind === "credit" ? (
              <form action={cancelCreditNote}><input type="hidden" name="id" value={invoice.id} /><SubmitButton variant="danger">{tx("Cancel credit note")}</SubmitButton></form>
            ) : null}
          </>
        }
      />
      <Banner error={one(query.error) ? tx(one(query.error)) : undefined} notice={one(query.notice) ? tx(one(query.notice)) : undefined} />
      <DetailLayout
        side={
          <Panel title={tx("Details")}>
            <Properties
              items={[
                { label: tx("Customer"), value: <Link href={`/customers/${invoice.customerId}`} className="hover:underline">{invoice.customer.name}</Link> },
                { label: tx("Order"), value: invoice.salesOrder ? <Link href={`/sales-orders/${invoice.salesOrderId}`} className="hover:underline">{invoice.salesOrder.number}</Link> : "—" },
                { label: tx("Refers to"), value: invoice.corrects ? <Link href={`/invoices/${invoice.correctsId}`} className="hover:underline">{invoice.corrects.number}</Link> : "—", hidden: !invoice.corrects },
                { label: tx("Follow-ups"), value: invoice.correctedBy.length ? <span className="flex flex-col">{invoice.correctedBy.map((entry) => <Link key={entry.id} href={`/invoices/${entry.id}`} className="hover:underline">{entry.number}</Link>)}</span> : "—", hidden: invoice.correctedBy.length === 0 },
                { label: tx("Issued"), value: formatDay(invoice.issuedAt) },
                { label: tx("Due"), value: <span className={overdue ? "font-medium text-danger" : ""}>{formatDay(invoice.dueAt)}</span> },
                { label: tx("Paid"), value: money(paid) },
                { label: tx("Open"), value: <span className="font-semibold">{money(open)}</span> },
              ]}
            />
          </Panel>
        }
      >
        {canPay ? (
          <Panel title={tx("Record payment")} description={tx("Partial payments are allowed. The open amount is filled in.")}>
            <form action={payInvoice} className="grid gap-2 sm:grid-cols-[140px_150px_1fr_auto]">
              <input type="hidden" name="id" value={invoice.id} />
              <input name="amount" required defaultValue={centsToInput(open)} className={`${fieldClass} text-right tabular-nums`} aria-label={tx("Amount")} />
              <select name="method" defaultValue="bank" className={fieldClass} aria-label={tx("Payment method")}>
                {Object.entries(paymentMethods).map(([key, label]) => <option key={key} value={key}>{tx(label)}</option>)}
              </select>
              <input name="reference" placeholder={tx("Reference (optional)")} className={fieldClass} />
              <SubmitButton>{tx("Post payment")}</SubmitButton>
            </form>
          </Panel>
        ) : null}

        <Panel flush>
          <div className="flex items-start justify-between gap-6 px-6 pb-5 pt-6">
            <div>
              <div className="text-[12px] text-muted">{tx("Invoice")}</div>
              <div className="text-[18px] font-semibold tracking-[-0.02em]">{invoice.number}</div>
            </div>
            <div className="text-right text-[13px]">
              <div className="font-medium">{invoice.customer.name}</div>
              <div className="text-muted">{invoice.customer.city}</div>
            </div>
          </div>
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
              {invoice.lines.map((line) => (
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
            <div className="flex justify-between text-muted"><dt>{tx("Net")}</dt><dd className="tabular-nums">{money(invoice.netCents)}</dd></div>
            <div className="flex justify-between text-muted"><dt>{tx("Tax")}</dt><dd className="tabular-nums">{money(invoice.taxCents)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>{tx("Grand total")}</dt><dd className="tabular-nums">{money(invoice.totalCents)}</dd></div>
          </dl>
        </Panel>

        {invoice.payments.length ? (
          <Panel title={tx("Payments")} flush>
            <ul>
              {invoice.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px]">
                  <span>
                    {tx(paymentMethods[payment.method] ?? payment.method)}
                    <span className="ml-2 text-muted">{formatDay(payment.paidAt)}</span>
                    {payment.reference ? <span className="ml-2 font-mono text-[12px] text-faint">{payment.reference}</span> : null}
                  </span>
                  <span className={`font-medium tabular-nums ${payment.amountCents < 0 ? "text-danger" : "text-ok"}`}>{money(payment.amountCents)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
        <ActivityFeed entityType="invoice" entityId={invoice.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/invoices/${invoice.id}`} />
      </DetailLayout>
    </div>
  );
}
