import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { cn, money, one, qty } from "@/lib/format";
import { productStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { exportHref, paginate } from "@/lib/paging";
import { getBalances, needsReorder } from "@/server/snapshot";
import { Filters } from "@/components/filters";
import { ListTable } from "@/components/list-table";
import { Banner, Button, PageIntro, Panel, Pill, Status, Tabs } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Products") };
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const q = one(query.q);
  const status = one(query.status);
  const category = one(query.category);
  const [products, balances, all] = await Promise.all([
    prisma.product.findMany({
      where: {
        organizationId: session.organization.id,
        ...(status ? { status } : { status: { not: "archived" } }),
        ...(category ? { category } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { variants: { some: { OR: [{ sku: { contains: q, mode: "insensitive" } }, { ean: { contains: q } }] } } }] } : {}),
      },
      include: { variants: { orderBy: { sku: "asc" } }, images: { orderBy: { position: "asc" }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    getBalances(session.organization.id),
    prisma.product.findMany({ where: { organizationId: session.organization.id }, select: { status: true, category: true } }),
  ]);
  const categories = [...new Set(all.map((item) => item.category).filter(Boolean))].sort();
  const count = (value?: string) => all.filter((item) => (value ? item.status === value : item.status !== "archived")).length;
  const writable = can(session.role, "catalog.write");
  const href = (value: string) => `/products${value ? `?status=${value}` : ""}`;
  const { page, total, rows } = paginate(products, query);
  void locale;

  return (
    <div>
      <PageIntro title={tx("Products")} actions={writable ? <Button href="/products/new">{tx("Create product")}</Button> : undefined} />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <Tabs
        items={[
          { href: href(""), label: tx("All"), active: !status, count: count() },
          { href: href("active"), label: tx("Active"), active: status === "active", count: count("active") },
          { href: href("draft"), label: tx("Draft"), active: status === "draft", count: count("draft") },
          { href: href("archived"), label: tx("Archived"), active: status === "archived", count: count("archived") },
        ]}
      />
      <Filters
        action="/products"
        q={q}
        placeholder={tx("Name, SKU or EAN")}
        hidden={{ status }}
        selects={categories.length ? [{ name: "category", value: category, placeholder: tx("All categories"), options: categories.map((item) => ({ value: item, label: item })) }] : []}
      />
      <Panel flush>
        <ListTable
          id="products"
          page={page}
          total={total}
          exportHref={exportHref("products", query)}
          bulk={
            writable
              ? {
                  entity: "product",
                  allIds: products.map((product) => product.id),
                  actions: [
                    { key: "activate", label: "Set active" },
                    { key: "draft", label: "Set to draft" },
                    { key: "archive", label: "Archive", tone: "danger" },
                  ],
                }
              : undefined
          }
          columns={[
            { key: "product", label: tx("Product") },
            { key: "sku", label: tx("SKU") },
            { key: "category", label: tx("Category") },
            { key: "stock", label: tx("Stock"), align: "right" },
            { key: "price", label: tx("Price"), align: "right" },
            { key: "status", label: tx("Status") },
          ]}
          rows={rows.map((product) => {
            const balance = balances.filter((row) => row.productId === product.id);
            const stock = balance.reduce((sum, row) => sum + row.onHand, 0);
            const low = balance.some(needsReorder);
            return {
              key: product.id,
              href: `/products/${product.id}`,
              cells: {
                product: (
                  <span className="flex items-center gap-3">
                    {product.images[0] ? (
                      <img src={`/api/images/${product.images[0].id}`} alt="" className="h-[34px] w-[34px] shrink-0 rounded-lg object-cover ring-1 ring-line" />
                    ) : (
                      <span className="h-[34px] w-[34px] shrink-0 rounded-lg bg-subtle ring-1 ring-line" />
                    )}
                    <span className="min-w-0">
                      <span className={cn("block truncate", !product.name && "text-faint")}>{product.name || tx("Untitled product")}</span>
                      <span className="block text-[12px] font-normal text-muted">{product.variants.length === 1 ? tx("1 variant") : tx("{n} variants", { n: product.variants.length })}</span>
                    </span>
                  </span>
                ),
                sku: <span className="font-mono text-[12px] text-muted">{product.variants[0]?.sku}{product.variants.length > 1 ? ` +${product.variants.length - 1}` : ""}</span>,
                category: <span className="text-muted">{product.category || "—"}</span>,
                stock: (
                  <span className="inline-flex items-center gap-2">
                    {stock < 0 ? <Pill tone="danger">{tx("Negative")}</Pill> : low ? <Pill tone="warning">{tx("Low")}</Pill> : null}
                    <span className={stock < 0 ? "font-medium text-danger" : ""}>{qty(stock)}</span>
                  </span>
                ),
                price: money(product.variants[0]?.priceCents ?? 0),
                status: <Status map={txMap(productStatus, tx)} value={product.status} />,
              },
            };
          })}
          empty={{ title: tx("No products found"), body: q ? tx("Nothing matches “{query}”.", { query: q }) : tx("Create the first product or import a CSV in settings."), action: writable ? <Button href="/products/new">{tx("Create product")}</Button> : undefined }}
        />
      </Panel>
    </div>
  );
}
