import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { signedInvoiceNet } from "@/lib/invoices";
import { getBalances } from "@/server/snapshot";

function csv(rows: (string | number | null | undefined)[][]) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((cell) => {
            const text = cell == null ? "" : String(cell);
            return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(","),
      )
      .join("\n")
  );
}

const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : "");
const eur = (cents: number) => (cents / 100).toFixed(2);
const like = (value: string) => ({ contains: value, mode: "insensitive" as const });

export async function GET(request: Request, context: { params: Promise<{ entity: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { entity } = await context.params;
  const org = session.organization.id;
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  const ids = params.getAll("ids").flatMap((value) => value.split(",")).filter(Boolean);
  const idFilter = ids.length ? { id: { in: ids } } : {};
  let body = "";
  if (entity === "products") {
    const status = params.get("status") ?? "";
    const category = params.get("category") ?? "";
    const products = await prisma.productVariant.findMany({
      where: {
        organizationId: org,
        ...(ids.length ? { productId: { in: ids } } : {}),
        ...(status ? { product: { status } } : {}),
        ...(category ? { product: { category } } : {}),
        ...(q ? { OR: [{ sku: like(q) }, { product: { name: like(q) } }] } : {}),
      },
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    });
    body = csv([
      ["sku", "name", "variant", "status", "category", "ean", "price", "cost", "reorder_point"],
      ...products.map((variant) => [variant.sku, variant.product.name, variant.name, variant.product.status, variant.product.category, variant.ean, eur(variant.priceCents), eur(variant.costCents), variant.reorderPoint]),
    ]);
  } else if (entity === "customers") {
    const type = params.get("type") ?? "";
    const customers = await prisma.customer.findMany({
      where: { organizationId: org, ...idFilter, ...(type ? { type } : {}), ...(q ? { OR: [{ name: like(q) }, { company: like(q) }, { email: like(q) }, { code: { contains: q } }, { city: like(q) }] } : {}) },
      include: { salesOrders: { select: { id: true } }, invoices: { select: { netCents: true, status: true, kind: true } } },
      orderBy: { name: "asc" },
    });
    body = csv([
      ["code", "name", "company", "email", "phone", "type", "street", "postal_code", "city", "country", "payment_terms", "orders", "revenue_net"],
      ...customers.map((customer) => [customer.code, customer.name, customer.company, customer.email, customer.phone, customer.type, customer.street, customer.postalCode, customer.city, customer.country, customer.paymentTerms, customer.salesOrders.length, eur(customer.invoices.reduce((sum, invoice) => sum + signedInvoiceNet(invoice), 0))]),
    ]);
  } else if (entity === "sales-orders") {
    const channel = params.get("channel") ?? "";
    const orders = await prisma.salesOrder.findMany({
      where: { organizationId: org, ...idFilter, ...(channel ? { channel } : {}), ...(q ? { OR: [{ number: { contains: q } }, { externalRef: { contains: q } }, { customer: { name: like(q) } }] } : {}) },
      include: { customer: true, lines: true },
      orderBy: { orderedAt: "desc" },
    });
    body = csv([
      ["number", "customer", "status", "channel", "priority", "on_hold", "ordered_at", "promised_at", "external_ref", "lines", "total_gross"],
      ...orders.map((order) => [order.number, order.customer.name, order.status, order.channel, order.priority, order.onHold ? "yes" : "no", day(order.orderedAt), day(order.promisedAt), order.externalRef, order.lines.length, eur(order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0))]),
    ]);
  } else if (entity === "purchase-orders") {
    const status = params.get("status") ?? "";
    const orders = await prisma.purchaseOrder.findMany({
      where: {
        organizationId: org,
        ...idFilter,
        ...(status === "open" ? { status: { in: ["ordered", "partial"] } } : status ? { status } : {}),
        ...(q ? { OR: [{ number: { contains: q } }, { supplier: { name: like(q) } }] } : {}),
      },
      include: { supplier: true, lines: true },
      orderBy: { createdAt: "desc" },
    });
    body = csv([
      ["number", "supplier", "status", "created_at", "ordered_at", "expected_at", "lines", "value_net"],
      ...orders.map((order) => [order.number, order.supplier.name, order.status, day(order.createdAt), day(order.orderedAt), day(order.expectedAt), order.lines.length, eur(order.lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0))]),
    ]);
  } else if (entity === "invoices") {
    const kind = params.get("kind") ?? "";
    const status = params.get("status") ?? "";
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: org, ...idFilter, ...(kind ? { kind } : {}), ...(status ? { status } : {}), ...(q ? { OR: [{ number: { contains: q } }, { customer: { name: like(q) } }] } : {}) },
      include: { customer: true, salesOrder: { select: { number: true } }, corrects: { select: { number: true } }, payments: { select: { amountCents: true } } },
      orderBy: { issuedAt: "desc" },
    });
    body = csv([
      ["number", "kind", "customer", "order", "refers_to", "status", "issued_at", "due_at", "net", "tax", "gross", "paid"],
      ...invoices.map((invoice) => [invoice.number, invoice.kind, invoice.customer.name, invoice.salesOrder?.number ?? "", invoice.corrects?.number ?? "", invoice.status, day(invoice.issuedAt), day(invoice.dueAt), eur(invoice.netCents), eur(invoice.taxCents), eur(invoice.totalCents), eur(invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0))]),
    ]);
  } else if (entity === "stock") {
    const balances = await getBalances(org);
    const rows = q ? balances.filter((row) => row.sku.toLowerCase().includes(q.toLowerCase()) || row.productName.toLowerCase().includes(q.toLowerCase())) : balances;
    body = csv([["sku", "name", "on_hand", "incoming", "reorder_point"], ...rows.map((row) => [row.sku, row.productName, row.onHand, row.incoming, row.reorderPoint])]);
  } else if (entity === "stock-movements") {
    const movements = await prisma.stockMovement.findMany({
      where: { organizationId: org, ...idFilter, ...(q ? { OR: [{ variant: { sku: { contains: q } } }, { variant: { product: { name: like(q) } } }, { referenceLabel: { contains: q } }] } : {}) },
      include: { variant: { include: { product: true } }, warehouse: true, location: true },
      orderBy: { createdAt: "desc" },
    });
    body = csv([
      ["date", "sku", "product", "type", "quantity", "warehouse", "location", "reference", "reason"],
      ...movements.map((movement) => [movement.createdAt.toISOString(), movement.variant.sku, movement.variant.product.name, movement.type, movement.quantity, movement.warehouse.code, movement.location.code, movement.referenceLabel, movement.reason]),
    ]);
  } else if (entity === "suppliers") {
    const suppliers = await prisma.supplier.findMany({
      where: { organizationId: org, ...idFilter, ...(q ? { OR: [{ name: like(q) }, { code: like(q) }, { city: like(q) }, { customerNumber: like(q) }] } : {}) },
      orderBy: { name: "asc" },
    });
    body = csv([
      ["code", "name", "email", "phone", "city", "country", "lead_time_days", "payment_terms", "customer_number"],
      ...suppliers.map((supplier) => [supplier.code, supplier.name, supplier.email, supplier.phone, supplier.city, supplier.country, supplier.leadTimeDays, supplier.paymentTerms, supplier.customerNumber]),
    ]);
  } else if (entity === "shipments") {
    const status = params.get("status") ?? "";
    const shipments = await prisma.shipment.findMany({
      where: { organizationId: org, ...idFilter, ...(status ? { status } : {}), ...(q ? { OR: [{ number: { contains: q } }, { trackingNumber: { contains: q } }, { salesOrder: { number: { contains: q } } }, { salesOrder: { customer: { name: like(q) } } }] } : {}) },
      include: { salesOrder: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
    });
    body = csv([
      ["number", "order", "customer", "carrier", "tracking", "status", "shipped_at"],
      ...shipments.map((shipment) => [shipment.number, shipment.salesOrder.number, shipment.salesOrder.customer.name, shipment.carrier, shipment.trackingNumber, shipment.status, day(shipment.shippedAt)]),
    ]);
  } else if (entity === "returns") {
    const status = params.get("status") ?? "";
    const returns = await prisma.return.findMany({
      where: { organizationId: org, ...idFilter, ...(status ? { status } : {}), ...(q ? { OR: [{ number: { contains: q } }, { reason: like(q) }, { salesOrder: { number: { contains: q } } }, { customer: { name: like(q) } }] } : {}) },
      include: { customer: true, salesOrder: true },
      orderBy: { createdAt: "desc" },
    });
    body = csv([
      ["number", "order", "customer", "reason", "status", "created_at"],
      ...returns.map((entry) => [entry.number, entry.salesOrder.number, entry.customer.name, entry.reason, entry.status, day(entry.createdAt)]),
    ]);
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
