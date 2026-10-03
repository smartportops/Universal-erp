import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatWhen, one, signedQty } from "@/lib/format";
import { movementTypes } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { exportHref, paginate } from "@/lib/paging";
import { Filters } from "@/components/filters";
import { ListTable } from "@/components/list-table";
import { Banner, PageIntro, Panel } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Stock movements") };
}

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  const query = await searchParams;
  const rawQ = one(query.q);
  const view = one(query.view);
  if (view === "reorder") redirect("/reorder");
  if (view === "negative" || view === "stock") {
    const next = new URLSearchParams();
    next.set("tab", "bestand");
    if (view === "negative") next.set("view", "negative");
    if (rawQ) next.set("q", rawQ);
    redirect(`/warehouses?${next.toString()}`);
  }
  const movements = await prisma.stockMovement.findMany({
    where: {
      organizationId: session.organization.id,
      ...(rawQ ? { OR: [{ variant: { sku: { contains: rawQ, mode: "insensitive" } } }, { variant: { product: { name: { contains: rawQ, mode: "insensitive" } } } }, { referenceLabel: { contains: rawQ, mode: "insensitive" } }] } : {}),
    },
    include: { variant: { include: { product: true } }, warehouse: true, location: true },
    orderBy: { createdAt: "desc" },
  });
  const { page, total, rows } = paginate(movements, query);

  return (
    <div>
      <PageIntro
        title={tx("Stock movements")}
        description={tx("Goods receipt, shipping, transfer and counting. On hand is the sum of these movements.")}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <Filters action="/stock" q={rawQ} placeholder={tx("SKU, product or document")} />
      <Panel flush>
        <ListTable
          id="stock-movements"
          page={page}
          total={total}
          exportHref={exportHref("stock-movements", query)}
          columns={[
            { key: "product", label: tx("Product") },
            { key: "type", label: tx("Type") },
            { key: "reference", label: tx("Reference") },
            { key: "location", label: tx("Location") },
            { key: "quantity", label: tx("Quantity"), align: "right" },
            { key: "when", label: tx("When"), align: "right" },
          ]}
          rows={rows.map((movement) => ({
            key: movement.id,
            cells: {
              product: (
                <Link href={`/products/${movement.variant.productId}`} className="hover:underline">
                  <span className="block font-medium">{movement.variant.product.name}</span>
                  <span className="font-mono text-[12px] text-muted">{movement.variant.sku}</span>
                </Link>
              ),
              type: tx(movementTypes[movement.type] ?? movement.type),
              reference: <span className="text-muted">{movement.referenceLabel || movement.reason || "—"}</span>,
              location: <span className="font-mono text-[12px] text-muted">{movement.warehouse.code} · {movement.location.code}</span>,
              quantity: <span className={`font-medium ${movement.quantity < 0 ? "text-danger" : "text-ok"}`}>{signedQty(movement.quantity)}</span>,
              when: <span className="text-[12px] text-faint">{formatWhen(movement.createdAt)}</span>,
            },
          }))}
          empty={{ title: tx("No movements"), body: tx("Goods receipts, shipments and adjustments show up here.") }}
        />
      </Panel>
    </div>
  );
}
