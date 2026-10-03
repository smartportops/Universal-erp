import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDay, money, one, qty } from "@/lib/format";
import { purchaseStatus } from "@/lib/labels";
import { txMap } from "@/lib/i18n";
import { getLocale, translator } from "@/lib/i18n-server";
import { entityExtras } from "@/server/entity";
import { getBalances } from "@/server/snapshot";
import { ActivityFeed, DetailLayout, EntityFields } from "@/components/entity-panel";
import { InlineEdit } from "@/components/inline-edit";
import { Banner, Button, DataTable, PageIntro, Panel, Properties, Status, Thumb } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  return { title: supplier?.name ?? tx("Supplier") };
}

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const supplier = await prisma.supplier.findFirst({
    where: { id, organizationId: session.organization.id },
    include: { purchaseOrders: { orderBy: { createdAt: "desc" }, take: 10, include: { lines: true } } },
  });
  if (!supplier) notFound();
  const [extras, balances] = await Promise.all([
    entityExtras(session.organization.id, "supplier", supplier.id),
    getBalances(session.organization.id),
  ]);
  const products = balances.filter((row) => row.supplierId === supplier.id);
  const writable = can(session.role, "purchasing.write");
  const edit = (field: string, value: string, type: "text" | "number" | "textarea" = "text", display?: string) => (
    <InlineEdit entity="supplier" id={supplier.id} field={field} value={value} type={type} display={display} disabled={!writable} placeholder={tx("Add")} />
  );

  return (
    <div>
      <PageIntro
        back={{ href: "/suppliers", label: tx("Suppliers") }}
        thumb={<Thumb label={supplier.name} size={44} />}
        eyebrow={supplier.code}
        title={<InlineEdit entity="supplier" id={supplier.id} field="name" value={supplier.name} disabled={!writable} textClassName="text-[22px] font-semibold tracking-[-0.02em]" />}
        actions={writable ? <Button href={`/purchase-orders/new?supplier=${supplier.id}`}>{tx("New purchase order")}</Button> : null}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <DetailLayout
        side={
          <>
            <Panel title={tx("Terms")}>
              <Properties
                items={[
                  { label: tx("Email"), value: edit("email", supplier.email) },
                  { label: tx("Country"), value: edit("country", supplier.country) },
                  { label: tx("Lead time"), value: edit("leadTimeDays", String(supplier.leadTimeDays), "number", tx("{days} days", { days: supplier.leadTimeDays })) },
                  { label: tx("Payment terms"), value: edit("paymentTerms", supplier.paymentTerms) },
                ]}
              />
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1 text-[13px] text-muted">{tx("Note")}</div>
                {edit("notes", supplier.notes, "textarea")}
              </div>
            </Panel>
            <EntityFields entityType="supplier" entityId={supplier.id} fields={extras.fields} files={extras.files} canEdit={can(session.role, "comments.write")} returnTo={`/suppliers/${supplier.id}`} />
          </>
        }
      >
        <Panel title={tx("Purchase orders")} flush>
          <DataTable
            columns={[{ label: tx("Purchase order") }, { label: tx("Expected") }, { label: tx("Status") }, { label: tx("Value"), align: "right" }]}
            rows={supplier.purchaseOrders.map((order) => ({
              key: order.id,
              href: `/purchase-orders/${order.id}`,
              cells: [
                order.number,
                formatDay(order.expectedAt),
                <Status key="s" map={txMap(purchaseStatus, tx)} value={order.status} />,
                money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0)),
              ],
            }))}
            empty={{ title: tx("No purchase orders"), body: tx("Nothing is open with this supplier.") }}
          />
        </Panel>
        {products.length ? (
          <Panel title={tx("Items")} flush>
            <DataTable
              columns={[{ label: tx("Product") }, { label: tx("SKU") }, { label: tx("On hand"), align: "right" }, { label: tx("Incoming"), align: "right" }]}
              rows={products.map((row) => ({
                key: row.variantId,
                href: `/products/${row.productId}`,
                cells: [row.productName, <span key="sku" className="font-mono text-[12px]">{row.sku}</span>, <span key="q" className={row.onHand < 0 ? "text-danger" : ""}>{qty(row.onHand)}</span>, qty(row.incoming)],
              }))}
            />
          </Panel>
        ) : null}
        <ActivityFeed entityType="supplier" entityId={supplier.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/suppliers/${supplier.id}`} />
      </DetailLayout>
    </div>
  );
}
