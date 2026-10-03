import { prisma } from "@/lib/db";
import { dictionary } from "@/i18n/dictionary";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export type SearchHit = {
  id: string;
  group: string;
  label: string;
  hint: string;
  href: string;
};

export async function searchRecords(organizationId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const locale = await getLocale();
  const tx = (text: string) => translate(locale, text, dictionary);
  const [orders, products, customers, suppliers, purchases, serials, shipments, invoices] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        organizationId,
        OR: [{ number: { contains: q } }, { externalRef: { contains: q } }, { customer: { name: { contains: q } } }],
      },
      include: { customer: true },
      take: 5,
    }),
    prisma.productVariant.findMany({
      where: {
        organizationId,
        OR: [{ sku: { contains: q } }, { ean: { contains: q } }, { product: { name: { contains: q } } }, { name: { contains: q } }],
      },
      include: { product: true },
      take: 6,
    }),
    prisma.customer.findMany({
      where: { organizationId, OR: [{ name: { contains: q } }, { email: { contains: q } }, { code: { contains: q } }] },
      take: 4,
    }),
    prisma.supplier.findMany({
      where: { organizationId, OR: [{ name: { contains: q } }, { code: { contains: q } }] },
      take: 4,
    }),
    prisma.purchaseOrder.findMany({
      where: { organizationId, OR: [{ number: { contains: q } }, { supplier: { name: { contains: q } } }] },
      include: { supplier: true },
      take: 4,
    }),
    prisma.serialNumber.findMany({
      where: { organizationId, value: { contains: q } },
      include: { variant: true },
      take: 4,
    }),
    prisma.shipment.findMany({
      where: { organizationId, OR: [{ number: { contains: q } }, { trackingNumber: { contains: q } }] },
      take: 4,
    }),
    prisma.invoice.findMany({
      where: { organizationId, OR: [{ number: { contains: q } }, { customer: { name: { contains: q } } }] },
      take: 4,
    }),
  ]);

  return [
    ...orders.map((order) => ({
      id: order.id,
      group: tx("Orders"),
      label: order.number,
      hint: order.customer.name,
      href: `/sales-orders/${order.id}`,
    })),
    ...products.map((variant) => ({
      id: variant.id,
      group: tx("Products"),
      label: variant.sku,
      hint: `${variant.product.name}${variant.ean ? ` · ${variant.ean}` : ""}`,
      href: `/products/${variant.productId}`,
    })),
    ...customers.map((customer) => ({
      id: customer.id,
      group: tx("Customers"),
      label: customer.name,
      hint: customer.email || customer.code,
      href: `/customers/${customer.id}`,
    })),
    ...suppliers.map((supplier) => ({
      id: supplier.id,
      group: tx("Suppliers"),
      label: supplier.name,
      hint: supplier.code,
      href: `/suppliers/${supplier.id}`,
    })),
    ...purchases.map((order) => ({
      id: order.id,
      group: tx("Purchasing"),
      label: order.number,
      hint: order.supplier.name,
      href: `/purchase-orders/${order.id}`,
    })),
    ...serials.map((serial) => ({
      id: serial.id,
      group: tx("Serial numbers"),
      label: serial.value,
      hint: serial.variant.sku,
      href: `/products/${serial.variant.productId}`,
    })),
    ...shipments.map((shipment) => ({
      id: shipment.id,
      group: tx("Shipments"),
      label: shipment.trackingNumber || shipment.number,
      hint: shipment.number,
      href: `/shipments/${shipment.id}`,
    })),
    ...invoices.map((invoice) => ({
      id: invoice.id,
      group: tx("Invoices"),
      label: invoice.number,
      hint: invoice.status,
      href: `/invoices/${invoice.id}`,
    })),
  ];
}
