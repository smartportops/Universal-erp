import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { money, one } from "@/lib/format";
import { signedInvoiceNet } from "@/lib/invoices";
import { customerTypes } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { exportHref, paginate } from "@/lib/paging";
import { Filters } from "@/components/filters";
import { ListTable } from "@/components/list-table";
import { Banner, Button, PageIntro, Panel, Tabs, Thumb } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Customers") };
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const q = one(query.q);
  const type = one(query.type);
  const [customers, all] = await Promise.all([
    prisma.customer.findMany({
      where: {
        organizationId: session.organization.id,
        ...(type ? { type } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { code: { contains: q } }, { city: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { salesOrders: { select: { id: true } }, invoices: { select: { netCents: true, status: true, kind: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({ where: { organizationId: session.organization.id }, select: { type: true } }),
  ]);
  const tab = (key: string, label: string) => ({
    href: `/customers${key ? `?type=${key}` : ""}`,
    label,
    active: type === key || (!type && !key),
    count: all.filter((item) => !key || item.type === key).length,
  });
  const writable = can(session.role, "sales.write");
  const { page, total, rows } = paginate(customers, query);
  void locale;
  return (
    <div>
      <PageIntro title={tx("Customers")} actions={writable ? <Button href="/customers/new">{tx("Create customer")}</Button> : undefined} />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <Tabs items={[tab("", tx("All")), tab("b2c", tx("Consumers")), tab("b2b", tx("Businesses"))]} />
      <Filters action="/customers" q={q} placeholder={tx("Name, company, email, city")} hidden={{ type }} />
      <Panel flush>
        <ListTable
          id="customers"
          page={page}
          total={total}
          exportHref={exportHref("customers", query)}
          bulk={
            writable
              ? {
                  entity: "customer",
                  allIds: customers.map((customer) => customer.id),
                  actions: [
                    { key: "b2b", label: "Mark as business" },
                    { key: "b2c", label: "Mark as consumer" },
                  ],
                }
              : undefined
          }
          columns={[
            { key: "customer", label: tx("Customer") },
            { key: "type", label: tx("Type") },
            { key: "city", label: tx("City") },
            { key: "country", label: tx("Country") },
            { key: "orders", label: tx("Orders"), align: "right" },
            { key: "revenue", label: tx("Revenue"), align: "right" },
          ]}
          rows={rows.map((customer) => ({
            key: customer.id,
            href: `/customers/${customer.id}`,
            cells: {
              customer: (
                <span className="flex items-center gap-3">
                  <Thumb label={customer.name} size={30} className="rounded-full" />
                  <span className="min-w-0">
                    <span className="block truncate">{customer.name}</span>
                    <span className="block truncate text-[12px] font-normal text-muted">{customer.email || customer.code}</span>
                  </span>
                </span>
              ),
              type: <span className="text-muted">{tx(customerTypes[customer.type] ?? customer.type)}</span>,
              city: <span className="text-muted">{customer.city || "—"}</span>,
              country: <span className="text-muted">{customer.country || "—"}</span>,
              orders: customer.salesOrders.length,
              revenue: money(customer.invoices.reduce((sum, invoice) => sum + signedInvoiceNet(invoice), 0)),
            },
          }))}
          empty={{ title: tx("No customers found"), body: tx("The first customer takes ten seconds.") }}
        />
      </Panel>
    </div>
  );
}
