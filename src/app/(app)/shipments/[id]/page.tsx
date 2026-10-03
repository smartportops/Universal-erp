import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDay, one, qty } from "@/lib/format";
import { shipmentStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { entityExtras } from "@/server/entity";
import { ActivityFeed, DetailLayout } from "@/components/entity-panel";
import { Banner, PageIntro, Panel, Properties, Status, Thumb } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  return { title: shipment?.number ?? tx("Shipment") };
}

export default async function ShipmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const shipment = await prisma.shipment.findFirst({
    where: { id, organizationId: session.organization.id },
    include: { salesOrder: { include: { customer: true } }, lines: { include: { variant: { include: { product: true } } } }, warehouse: true },
  });
  if (!shipment) notFound();
  const extras = await entityExtras(session.organization.id, "shipment", shipment.id);
  void locale;
  return (
    <div>
      <PageIntro
        back={{ href: "/shipments", label: tx("Shipments") }}
        eyebrow={<Link href={`/sales-orders/${shipment.salesOrderId}`} className="hover:text-ink hover:underline">{shipment.salesOrder.number} · {shipment.salesOrder.customer.name}</Link>}
        title={shipment.number}
        badges={<Status map={txMap(shipmentStatus, tx)} value={shipment.status} />}
      />
      <Banner notice={one(query.notice)} error={one(query.error)} />
      <DetailLayout
        side={
          <Panel title={tx("Shipping")}>
            <Properties
              items={[
                { label: tx("Carrier"), value: shipment.carrier === "Spedition" ? tx("Freight") : shipment.carrier },
                { label: tx("Tracking"), value: shipment.trackingNumber ? <span className="font-mono text-[12px]">{shipment.trackingNumber}</span> : "—" },
                { label: tx("Shipped"), value: formatDay(shipment.shippedAt) },
                { label: tx("Delivered"), value: formatDay(shipment.deliveredAt) },
                { label: tx("From warehouse"), value: shipment.warehouse.name },
              ]}
            />
          </Panel>
        }
      >
        <Panel title={tx("Contents")} flush>
          <ul>
            {shipment.lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 border-t border-line px-5 py-3 text-[13px]">
                <Thumb label={line.variant.product.name} size={34} />
                <span className="min-w-0 flex-1">
                  <Link href={`/products/${line.variant.productId}`} className="block truncate font-medium hover:underline">{line.variant.product.name}</Link>
                  <span className="font-mono text-[12px] text-muted">{line.variant.sku}</span>
                </span>
                <span className="font-medium tabular-nums">{tx("{n} pcs", { n: qty(line.quantity) })}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <ActivityFeed entityType="shipment" entityId={shipment.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/shipments/${shipment.id}`} />
      </DetailLayout>
    </div>
  );
}
