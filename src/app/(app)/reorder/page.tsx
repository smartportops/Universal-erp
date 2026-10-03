import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { daysFromToday, money, one, qty, toDateInput } from "@/lib/format";
import { getLocale, translator } from "@/lib/i18n-server";
import { getBalances, isCovered, needsReorder, suggestedQty, type BalanceRow } from "@/server/snapshot";
import { createPurchaseFromSuggestions } from "@/server/actions/catalog";
import { Banner, Button, EmptyState, PageIntro, Panel, Pill, Stat, Thumb, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Reorder suggestions") };
}

type Group = { supplierId: string | null; supplierName: string; leadTimeDays: number; rows: BalanceRow[] };
type Tx = (text: string, vars?: Record<string, string | number>) => string;

export default async function ReorderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  const query = await searchParams;
  const [balances, warehouse] = await Promise.all([
    getBalances(session.organization.id),
    prisma.warehouse.findFirst({ where: { organizationId: session.organization.id, active: true }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] }),
  ]);
  const writable = can(session.role, "purchasing.write");
  const due = balances.filter(needsReorder);
  const covered = balances.filter(isCovered);

  const groups = new Map<string, Group>();
  for (const row of due) {
    const key = row.supplierId ?? "";
    const group = groups.get(key) ?? { supplierId: row.supplierId, supplierName: row.supplierName ?? tx("No supplier"), leadTimeDays: row.leadTimeDays ?? 14, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || b.rows.length - a.rows.length);
  const total = due.reduce((sum, row) => sum + suggestedQty(row) * row.costCents, 0);
  const critical = due.filter((row) => row.onHand - row.openDemand <= 0).length;

  return (
    <div>
      <PageIntro
        title={tx("Reorder suggestions")}
        description={tx("Everything that has dropped below the reorder point, grouped by supplier. Adjust the quantity, create a draft, done.")}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label={tx("Products to reorder")} value={String(due.length)} tone={due.length ? "warning" : undefined} />
        <Stat label={tx("Of those, uncovered")} value={String(critical)} hint={tx("On hand does not cover open orders")} tone={critical ? "danger" : undefined} />
        <Stat label={tx("Order value at cost")} value={money(total)} />
      </div>

      {ordered.length === 0 ? (
        <Panel>
          <EmptyState title={tx("Fully covered")} body={tx("No product is below its reorder point. You set the reorder point and order quantity on the product.")} action={<Button href="/products" variant="secondary">{tx("Go to products")}</Button>} />
        </Panel>
      ) : (
        <div className="space-y-5">
          {ordered.map((group) => (
            <SupplierGroup key={group.supplierId ?? "none"} group={group} warehouseId={warehouse?.id ?? ""} writable={writable} tx={tx} />
          ))}
        </div>
      )}

      {covered.length ? (
        <Panel title={tx("Already on the way")} description={tx("Below the reorder point, but covered by open purchase orders.")} flush>
          <ul className="divide-y divide-line">
            {covered.map((row) => (
              <li key={row.variantId} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                <Thumb label={row.productName} size={28} />
                <Link href={`/products/${row.productId}`} className="min-w-0 flex-1 truncate hover:underline">
                  {row.productName} <span className="font-mono text-[12px] text-muted">{row.sku}</span>
                </Link>
                <span className="text-muted">{tx("{onHand} on hand · {incoming} incoming", { onHand: qty(row.onHand), incoming: qty(row.incoming) })}</span>
                <Pill tone="info">{tx("Ordered")}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function SupplierGroup({ group, warehouseId, writable, tx }: { group: Group; warehouseId: string; writable: boolean; tx: Tx }) {
  const sum = group.rows.reduce((acc, row) => acc + suggestedQty(row) * row.costCents, 0);
  const canOrder = writable && !!group.supplierId;
  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <Thumb label={group.supplierName} size={36} />
          <div>
            {group.supplierId ? (
              <Link href={`/suppliers/${group.supplierId}`} className="block text-[14px] font-semibold hover:underline">{group.supplierName}</Link>
            ) : (
              <span className="block text-[14px] font-semibold">{group.supplierName}</span>
            )}
            <span className="text-[12px] text-muted">
              {group.supplierId
                ? tx("{count} products · Lead time {days} days · {amount}", { count: group.rows.length, days: group.leadTimeDays, amount: money(sum) })
                : tx("{count} products · Set a supplier on the product, then order", { count: group.rows.length })}
            </span>
          </div>
        </div>
        {canOrder ? (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] text-muted">
              {tx("Expected")}
              <input name="expectedAt" type="date" defaultValue={toDateInput(daysFromToday(group.leadTimeDays))} className={`${fieldClass} h-8 w-auto py-0 text-[13px]`} />
            </label>
            <Button href={`/purchase-orders/new?supplier=${group.supplierId}`} variant="ghost" size="sm">{tx("In the editor")}</Button>
            <SubmitButton size="sm" pendingLabel={tx("Creating…")}>{tx("Create draft")}</SubmitButton>
          </div>
        ) : null}
      </div>
      <table className="w-full border-t border-line text-[13px]">
        <thead>
          <tr className="text-left text-[11px] font-medium uppercase tracking-[0.04em] text-faint">
            <th className="px-5 py-2 font-medium">{tx("Product")}</th>
            <th className="px-3 py-2 text-right font-medium">{tx("On hand")}</th>
            <th className="px-3 py-2 text-right font-medium">{tx("Reserved")}</th>
            <th className="px-3 py-2 text-right font-medium">{tx("Incoming")}</th>
            <th className="px-3 py-2 text-right font-medium">{tx("Reorder point")}</th>
            <th className="px-3 py-2 text-right font-medium">{tx("Quantity")}</th>
            <th className="px-5 py-2 text-right font-medium">{tx("Total")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {group.rows.map((row) => {
            const suggestion = suggestedQty(row);
            const short = row.onHand - row.openDemand <= 0;
            return (
              <tr key={row.variantId} className="hover:bg-subtle">
                <td className="px-5 py-2.5">
                  <Link href={`/products/${row.productId}`} className="flex items-center gap-3 hover:underline">
                    <Thumb label={row.productName} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.productName}{row.name && row.name !== "Standard" ? ` · ${row.name}` : ""}</span>
                      <span className="block font-mono text-[12px] text-muted">{row.sku}</span>
                    </span>
                  </Link>
                </td>
                <td className={`px-3 py-2.5 text-right font-semibold ${row.onHand < 0 ? "text-danger" : ""}`}>{qty(row.onHand)}</td>
                <td className="px-3 py-2.5 text-right text-muted">
                  {row.openDemand ? qty(row.openDemand) : "—"}
                  {short ? <span className="ml-2 inline-flex align-middle"><Pill tone="danger">{tx("Short")}</Pill></span> : null}
                </td>
                <td className="px-3 py-2.5 text-right text-muted">{row.incoming ? qty(row.incoming) : "—"}</td>
                <td className="px-3 py-2.5 text-right text-muted">{row.reorderPoint}</td>
                <td className="px-3 py-2.5 text-right">
                  {canOrder ? (
                    <input name={`qty_${row.variantId}`} type="number" min={0} step={1} defaultValue={suggestion} className={`${fieldClass} h-8 w-[76px] py-0 text-right text-[13px] font-medium`} />
                  ) : (
                    <span className="font-medium">{qty(suggestion)}</span>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right text-muted">{money(suggestion * row.costCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
  return canOrder ? (
    <form action={createPurchaseFromSuggestions} className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow)]">
      <input type="hidden" name="supplierId" value={group.supplierId ?? ""} />
      <input type="hidden" name="warehouseId" value={warehouseId} />
      {body}
    </form>
  ) : (
    <section className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow)]">{body}</section>
  );
}
