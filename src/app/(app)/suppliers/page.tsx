import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { one } from "@/lib/format";
import { getLocale, translator } from "@/lib/i18n-server";
import { exportHref, paginate } from "@/lib/paging";
import { Filters } from "@/components/filters";
import { ListTable } from "@/components/list-table";
import { Banner, Button, PageIntro, Panel, Thumb } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Suppliers") };
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  const query = await searchParams;
  const q = one(query.q);
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: session.organization.id, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { customerNumber: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { purchaseOrders: { select: { status: true } } },
    orderBy: { name: "asc" },
  });
  const { page, total, rows } = paginate(suppliers, query);
  return (
    <div>
      <PageIntro title={tx("Suppliers")} actions={can(session.role, "purchasing.write") ? <Button href="/suppliers/new">{tx("Create supplier")}</Button> : undefined} />
      <Banner notice={one(query.notice)} error={one(query.error)} />
      <Filters action="/suppliers" q={q} placeholder={tx("Name or number")} />
      <Panel flush>
        <ListTable
          id="suppliers"
          page={page}
          total={total}
          exportHref={exportHref("suppliers", query)}
          columns={[
            { key: "supplier", label: tx("Supplier") },
            { key: "city", label: tx("City") },
            { key: "country", label: tx("Country") },
            { key: "lead", label: tx("Lead time"), align: "right" },
            { key: "terms", label: tx("Payment terms") },
            { key: "open", label: tx("Open purchase orders"), align: "right" },
          ]}
          rows={rows.map((supplier) => ({
            key: supplier.id,
            href: `/suppliers/${supplier.id}`,
            cells: {
              supplier: (
                <span className="flex items-center gap-3">
                  <Thumb label={supplier.name} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate">{supplier.name}</span>
                    <span className="block text-[12px] font-normal text-muted">{supplier.code}</span>
                  </span>
                </span>
              ),
              city: <span className="text-muted">{supplier.city || "—"}</span>,
              country: <span className="text-muted">{supplier.country}</span>,
              lead: tx("{days} days", { days: supplier.leadTimeDays }),
              terms: <span className="text-muted">{supplier.paymentTerms}</span>,
              open: supplier.purchaseOrders.filter((order) => ["ordered", "partial"].includes(order.status)).length,
            },
          }))}
          empty={{ title: tx("No suppliers"), body: tx("No supplier, no purchasing.") }}
        />
      </Panel>
    </div>
  );
}
