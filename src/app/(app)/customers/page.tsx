import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { money, one } from "@/lib/format";
import { customerTypes } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { Filters } from "@/components/filters";
import { Banner, Button, DataTable, PageIntro, Panel, Tabs, Thumb } from "@/components/ui";

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
        ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { code: { contains: q } }, { city: { contains: q } }] } : {}),
      },
      include: { salesOrders: { select: { id: true } }, invoices: { select: { netCents: true, status: true } } },
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
  void locale;
  return (
    <div>
      <PageIntro title={tx("Customers")} actions={can(session.role, "sales.write") ? <Button href="/customers/new">{tx("Create customer")}</Button> : undefined} />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <Tabs items={[tab("", tx("All")), tab("b2c", tx("Consumers")), tab("b2b", tx("Businesses"))]} />
      <Filters action="/customers" q={q} placeholder={tx("Name, email, city")} hidden={{ type }} />
      <Panel flush>
        <DataTable
          columns={[{ label: tx("Customer") }, { label: tx("Type") }, { label: tx("City") }, { label: tx("Orders"), align: "right" }, { label: tx("Revenue"), align: "right" }]}
          rows={customers.map((customer) => ({
            key: customer.id,
            href: `/customers/${customer.id}`,
            cells: [
              <span key="n" className="flex items-center gap-3">
                <Thumb label={customer.name} size={30} className="rounded-full" />
                <span className="min-w-0">
                  <span className="block truncate">{customer.name}</span>
                  <span className="block truncate text-[12px] font-normal text-muted">{customer.email || customer.code}</span>
                </span>
              </span>,
              <span key="t" className="text-muted">{tx(customerTypes[customer.type] ?? customer.type)}</span>,
              <span key="c" className="text-muted">{customer.city || "—"}</span>,
              customer.salesOrders.length,
              money(customer.invoices.filter((invoice) => invoice.status !== "void").reduce((sum, invoice) => sum + invoice.netCents, 0)),
            ],
          }))}
          empty={{ title: tx("No customers found"), body: tx("The first customer takes ten seconds.") }}
        />
      </Panel>
    </div>
  );
}
