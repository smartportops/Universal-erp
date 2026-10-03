import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBalances } from "@/server/snapshot";

function csv(rows: (string | number)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? "");
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
}

export async function GET(request: Request, context: { params: Promise<{ entity: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { entity } = await context.params;
  const org = session.organization.id;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  let body = "";
  if (entity === "products") {
    const products = await prisma.productVariant.findMany({
      where: { organizationId: org, ...(q ? { OR: [{ sku: { contains: q } }, { product: { name: { contains: q } } }] } : {}) },
      include: { product: true },
    });
    body = csv([["sku", "name", "ean", "price", "cost"], ...products.map((variant) => [variant.sku, variant.product.name, variant.ean, (variant.priceCents / 100).toFixed(2), (variant.costCents / 100).toFixed(2)])]);
  } else if (entity === "customers") {
    const customers = await prisma.customer.findMany({ where: { organizationId: org } });
    body = csv([["code", "name", "email", "type", "city"], ...customers.map((customer) => [customer.code, customer.name, customer.email, customer.type, customer.city])]);
  } else if (entity === "sales-orders") {
    const orders = await prisma.salesOrder.findMany({ where: { organizationId: org }, include: { customer: true } });
    body = csv([["number", "customer", "status", "channel"], ...orders.map((order) => [order.number, order.customer.name, order.status, order.channel])]);
  } else if (entity === "stock") {
    const balances = await getBalances(org);
    body = csv([["sku", "name", "on_hand", "incoming", "reorder_point"], ...balances.map((row) => [row.sku, row.productName, row.onHand, row.incoming, row.reorderPoint])]);
  } else {
    return new Response("Unknown export", { status: 404 });
  }
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${entity}.csv"`,
    },
  });
}
