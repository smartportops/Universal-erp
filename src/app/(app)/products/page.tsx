import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { cn, money, one, qty } from "@/lib/format";
import { productStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { archiveProducts } from "@/server/actions/catalog";
import { getBalances, needsReorder } from "@/server/snapshot";
import { Filters } from "@/components/filters";
import { Banner, Button, DataTable, PageIntro, Panel, Pill, Status, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

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
        ...(q ? { OR: [{ name: { contains: q } }, { variants: { some: { OR: [{ sku: { contains: q } }, { ean: { contains: q } }] } } }] } : {}),
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
  void locale;

  return (
    <div>
      <PageIntro
        title={tx("Products")}
        actions={
          <>
            <Button href={`/api/export/products${q ? `?q=${encodeURIComponent(q)}` : ""}`} variant="secondary">{tx("Export")}</Button>
            {writable ? <Button href="/products/new">{tx("Create product")}</Button> : null}
          </>
        }
      />
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
      <form action={archiveProducts}>
        <Panel flush>
          <DataTable
            columns={[{ label: tx("Product") }, { label: tx("SKU") }, { label: tx("Category") }, { label: tx("Stock"), align: "right" }, { label: tx("Price"), align: "right" }, { label: tx("Status") }]}
            rows={products.map((product) => {
              const rows = balances.filter((row) => row.productId === product.id);
              const stock = rows.reduce((sum, row) => sum + row.onHand, 0);
              const low = rows.some(needsReorder);
              return {
                key: product.id,
                href: `/products/${product.id}`,
                select: writable ? product.id : undefined,
                cells: [
                  <span key="p" className="flex items-center gap-3">
                    {product.images[0] ? (
                      <img src={`/api/images/${product.images[0].id}`} alt="" className="h-[34px] w-[34px] shrink-0 rounded-lg object-cover ring-1 ring-line" />
                    ) : (
                      <span className="h-[34px] w-[34px] shrink-0 rounded-lg bg-subtle ring-1 ring-line" />
                    )}
                    <span className="min-w-0">
                      <span className={cn("block truncate", !product.name && "text-faint")}>{product.name || tx("Untitled product")}</span>
                      <span className="block text-[12px] font-normal text-muted">{product.variants.length === 1 ? tx("1 variant") : tx("{n} variants", { n: product.variants.length })}</span>
                    </span>
                  </span>,
                  <span key="sku" className="font-mono text-[12px] text-muted">{product.variants[0]?.sku}{product.variants.length > 1 ? ` +${product.variants.length - 1}` : ""}</span>,
                  <span key="c" className="text-muted">{product.category || "—"}</span>,
                  <span key="s" className="inline-flex items-center gap-2">
                    {stock < 0 ? <Pill tone="danger">{tx("Negative")}</Pill> : low ? <Pill tone="warning">{tx("Low")}</Pill> : null}
                    <span className={stock < 0 ? "font-medium text-danger" : ""}>{qty(stock)}</span>
                  </span>,
                  money(product.variants[0]?.priceCents ?? 0),
                  <Status key="status" map={txMap(productStatus, tx)} value={product.status} />,
                ],
              };
            })}
            empty={{ title: tx("No products found"), body: q ? tx("Nothing matches “{query}”.", { query: q }) : tx("Create the first product or import a CSV in settings."), action: writable ? <Button href="/products/new">{tx("Create product")}</Button> : undefined }}
          />
          {writable && products.length ? (
            <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[12px] text-muted">
              <span>{tx("Selection")}</span>
              <SubmitButton variant="secondary" size="sm">{tx("Archive")}</SubmitButton>
            </div>
          ) : null}
        </Panel>
      </form>
    </div>
  );
}
