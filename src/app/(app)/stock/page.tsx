import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatWhen, one, signedQty } from "@/lib/format";
import { movementTypes } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { Filters } from "@/components/filters";
import { Banner, DataTable, PageIntro, Panel } from "@/components/ui";

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
      ...(rawQ ? { OR: [{ variant: { sku: { contains: rawQ } } }, { variant: { product: { name: { contains: rawQ } } } }, { referenceLabel: { contains: rawQ } }] } : {}),
    },
    include: { variant: { include: { product: true } }, warehouse: true, location: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageIntro
        title={tx("Stock movements")}
        description={tx("Goods receipt, shipping, transfer and counting. On hand is the sum of these movements.")}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <Filters action="/stock" q={rawQ} placeholder={tx("SKU, product or document")} />
      <Panel flush>
        <DataTable
          columns={[{ label: tx("Product") }, { label: tx("Type") }, { label: tx("Reference") }, { label: tx("Location") }, { label: tx("Quantity"), align: "right" }, { label: tx("When"), align: "right" }]}
          rows={movements.map((movement) => ({
            key: movement.id,
            cells: [
              <Link key="a" href={`/products/${movement.variant.productId}`} className="hover:underline">
                <span className="block font-medium">{movement.variant.product.name}</span>
                <span className="font-mono text-[12px] text-muted">{movement.variant.sku}</span>
              </Link>,
              tx(movementTypes[movement.type] ?? movement.type),
              <span key="r" className="text-muted">{movement.referenceLabel || movement.reason || "—"}</span>,
              <span key="l" className="font-mono text-[12px] text-muted">{movement.warehouse.code} · {movement.location.code}</span>,
              <span key="q" className={`font-medium ${movement.quantity < 0 ? "text-danger" : "text-ok"}`}>{signedQty(movement.quantity)}</span>,
              <span key="w" className="text-[12px] text-faint">{formatWhen(movement.createdAt)}</span>,
            ],
          }))}
          empty={{ title: tx("No movements"), body: tx("Goods receipts, shipments and adjustments show up here.") }}
        />
      </Panel>
    </div>
  );
}
