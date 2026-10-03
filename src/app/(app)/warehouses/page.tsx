import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { money, one, qty } from "@/lib/format";
import { warehouseTypes } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { getBalances, isCovered, needsReorder } from "@/server/snapshot";
import { Filters } from "@/components/filters";
import { Banner, Button, DataTable, PageIntro, Panel, Pill, Stat, Tabs, Thumb } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Warehouses") };
}

export default async function WarehousesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  const query = await searchParams;
  const tab = one(query.tab);
  const view = one(query.view);
  const rawQ = one(query.q);
  const q = rawQ.toLowerCase();
  const [warehouses, movements, balances] = await Promise.all([
    prisma.warehouse.findMany({ where: { organizationId: session.organization.id }, include: { locations: true }, orderBy: { code: "asc" } }),
    prisma.stockMovement.findMany({ where: { organizationId: session.organization.id }, select: { warehouseId: true, quantity: true } }),
    getBalances(session.organization.id),
  ]);
  const units = (id: string) => movements.filter((movement) => movement.warehouseId === id).reduce((sum, movement) => sum + movement.quantity, 0);
  const stock = balances.filter((row) => {
    if (q && !`${row.sku} ${row.productName} ${row.name}`.toLowerCase().includes(q)) return false;
    if (view === "negative") return row.onHand < 0;
    return true;
  });
  const reorderCount = balances.filter(needsReorder).length;
  const negativeCount = balances.filter((row) => row.onHand < 0).length;
  const value = balances.reduce((sum, row) => sum + Math.max(row.onHand, 0) * row.costCents, 0);

  return (
    <div>
      <PageIntro
        title={tx("Warehouses")}
        description={tx("Warehouses, locations, and the on-hand quantity that comes from movements.")}
        actions={tab !== "bestand" && can(session.role, "settings.write") ? <Button href="/warehouses/new">{tx("Create warehouse")}</Button> : undefined}
      />
      <Banner notice={one(query.notice)} error={one(query.error)} />
      <Tabs
        items={[
          { href: "/warehouses", label: tx("Warehouse"), active: tab !== "bestand", count: warehouses.length },
          { href: "/warehouses?tab=bestand", label: tx("On hand"), active: tab === "bestand", count: balances.length },
        ]}
      />
      {tab === "bestand" ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Stat label={tx("Inventory value at cost")} value={money(value)} />
            <Stat label={tx("Reorder")} value={String(reorderCount)} href="/reorder" hint={tx("Reorder suggestions")} tone={reorderCount ? "warning" : undefined} />
            <Stat label={tx("Below zero")} value={String(negativeCount)} href="/warehouses?tab=bestand&view=negative" tone={negativeCount ? "danger" : undefined} />
          </div>
          <Filters action="/warehouses" q={rawQ} placeholder={tx("SKU or product")} hidden={{ tab: "bestand", view }} />
          <Panel flush>
            <DataTable
              columns={[{ label: tx("Product") }, { label: tx("Warehouse") }, { label: tx("On hand"), align: "right" }, { label: tx("Incoming"), align: "right" }, { label: tx("Reserved"), align: "right" }, { label: tx("Reorder point"), align: "right" }, { label: "" }]}
              rows={stock.map((row) => {
                const reorder = needsReorder(row);
                return {
                  key: row.variantId,
                  href: `/products/${row.productId}`,
                  cells: [
                    <span key="a" className="flex items-center gap-3">
                      <Thumb label={row.productName} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate">{row.productName}</span>
                        <span className="block font-mono text-[12px] font-normal text-muted">{row.sku}</span>
                      </span>
                    </span>,
                    <span key="w" className="text-[12px] text-muted">
                      {row.warehouses.filter((warehouse) => warehouse.quantity !== 0).map((warehouse) => `${warehouse.code} ${warehouse.quantity}`).join(" · ") || "—"}
                    </span>,
                    <span key="q" className={`font-semibold ${row.onHand < 0 ? "text-danger" : ""}`}>{qty(row.onHand)}</span>,
                    <span key="i" className="text-muted">{row.incoming ? qty(row.incoming) : "—"}</span>,
                    <span key="d" className="text-muted">{row.openDemand ? qty(row.openDemand) : "—"}</span>,
                    <span key="r" className="text-muted">{row.reorderPoint || "—"}</span>,
                    <span key="s" className="relative z-10 flex items-center justify-end gap-2">
                      {row.onHand < 0 ? <Pill tone="danger">{tx("Negative")}</Pill> : reorder ? <Pill tone="warning">{tx("Reorder")}</Pill> : isCovered(row) ? <Pill tone="info">{tx("Ordered")}</Pill> : null}
                      {reorder && row.supplierId && can(session.role, "purchasing.write") ? <Button href="/reorder" variant="secondary" size="sm">{tx("Order now")}</Button> : null}
                    </span>,
                  ],
                };
              })}
              empty={{ title: view === "negative" ? tx("Nothing below zero") : tx("No products"), body: tx("Nothing to do in this view right now.") }}
            />
          </Panel>
        </>
      ) : (
        <Panel flush>
          <DataTable
            columns={[{ label: tx("Warehouse") }, { label: tx("Type") }, { label: tx("City") }, { label: tx("Places"), align: "right" }, { label: tx("Units"), align: "right" }]}
            rows={warehouses.map((warehouse) => ({
              key: warehouse.id,
              href: `/warehouses/${warehouse.id}`,
              cells: [
                <span key="n" className="flex items-center gap-2">
                  {warehouse.name}
                  {warehouse.isDefault ? <Pill tone="info">{tx("Default")}</Pill> : null}
                </span>,
                <span key="t" className="text-muted">{tx(warehouseTypes[warehouse.type] ?? warehouse.type)}</span>,
                <span key="c" className="text-muted">{warehouse.city || "—"}</span>,
                warehouse.locations.length,
                <span key="u" className="font-medium">{qty(units(warehouse.id))}</span>,
              ],
            }))}
            empty={{ title: tx("No warehouse"), body: tx("No warehouse, no stock.") }}
          />
        </Panel>
      )}
    </div>
  );
}
