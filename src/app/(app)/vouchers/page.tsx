import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDay, money, one } from "@/lib/format";
import { documentKinds, invoiceKinds, invoiceStatus } from "@/lib/labels";
import { translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { exportHref, paginate } from "@/lib/paging";
import { listDocuments, matchesDocument } from "@/server/domain/vouchers";
import { FinanceTabs } from "@/components/finance-tabs";
import { Filters } from "@/components/filters";
import { ListTable } from "@/components/list-table";
import { Banner, Button, PageIntro, Panel, Status } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Vouchers") };
}

const voucherStatus = {
  booked: { label: "Booked", tone: "ok" as const },
  void: { label: "Voided", tone: "neutral" as const },
};

export default async function VouchersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const session = await requireUser();
  const query = await searchParams;
  const q = one(query.q);
  const direction = one(query.direction);
  const documents = (await listDocuments(session.organization.id)).filter((row) => matchesDocument(row, { q, direction }));
  const { page, total, rows } = paginate(documents, query);
  return (
    <div>
      <PageIntro
        title={tx("Vouchers")}
        description={tx("Every document in one list: uploads and the invoices, cancellations and credit notes issued here.")}
        actions={can(session.role, "finance.write") ? <Button href="/vouchers/new">{tx("Upload voucher")}</Button> : undefined}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <FinanceTabs active="vouchers" tx={tx} />
      <Filters
        action="/vouchers"
        q={q}
        placeholder={tx("Number, name or reference")}
        selects={[{
          name: "direction",
          value: direction,
          placeholder: tx("All vouchers"),
          options: [
            { value: "in", label: tx("Incoming voucher") },
            { value: "out", label: tx("Outgoing uploads") },
            { value: "system", label: tx("Issued here") },
          ],
        }]}
      />
      <Panel flush>
        <ListTable
          id="vouchers"
          page={page}
          total={total}
          exportHref={exportHref("vouchers", query)}
          columns={[
            { key: "date", label: tx("Date") },
            { key: "number", label: tx("Number") },
            { key: "type", label: tx("Type") },
            { key: "party", label: tx("Counterparty") },
            { key: "reference", label: tx("Their reference") },
            { key: "net", label: tx("Net"), align: "right" },
            { key: "tax", label: tx("VAT"), align: "right" },
            { key: "gross", label: tx("Gross"), align: "right" },
            { key: "status", label: tx("Status") },
          ]}
          rows={rows.map((row) => ({
            key: `${row.origin}-${row.id}`,
            href: row.origin === "system" ? `/invoices/${row.id}` : `/vouchers/${row.id}`,
            cells: {
              date: <span className="text-muted">{formatDay(row.date)}</span>,
              number: row.number,
              type: tx(row.origin === "system" ? (invoiceKinds[row.kind] ?? row.kind) : (documentKinds[row.kind === "in" ? "incoming" : "outgoing"] ?? row.kind)),
              party: row.party,
              reference: <span className="text-muted">{row.reference || "—"}</span>,
              net: money(row.net),
              tax: money(row.tax),
              gross: <span className="font-medium">{money(row.gross)}</span>,
              status: row.origin === "system"
                ? <Status map={txMap(invoiceStatus, tx)} value={row.status} />
                : <Status map={txMap(voucherStatus, tx)} value={row.status} />,
            },
          }))}
          empty={{ title: tx("No vouchers"), body: tx("Upload an incoming or outgoing document, or issue an invoice from an order.") }}
        />
      </Panel>
    </div>
  );
}
