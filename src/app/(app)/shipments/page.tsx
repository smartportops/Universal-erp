import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDay, one } from "@/lib/format";
import { shipmentStatus } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { txMap } from "@/lib/i18n";
import { Filters } from "@/components/filters";
import { DataTable, PageIntro, Panel, Status, Tabs } from "@/components/ui";

export async function generateMetadata() {
  const tx = await translator();
  return { title: tx("Shipments") };
}

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  const session = await requireUser();
  const query = await searchParams;
  const q = one(query.q);
  const status = one(query.status);
  const [shipments, all] = await Promise.all([
    prisma.shipment.findMany({
      where: {
        organizationId: session.organization.id,
        ...(status ? { status } : {}),
        ...(q ? { OR: [{ number: { contains: q } }, { trackingNumber: { contains: q } }, { salesOrder: { number: { contains: q } } }, { salesOrder: { customer: { name: { contains: q } } } }] } : {}),
      },
      include: { salesOrder: { include: { customer: true } }, lines: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.shipment.findMany({ where: { organizationId: session.organization.id }, select: { status: true } }),
  ]);
  const tab = (key: string, label: string) => ({
    href: `/shipments${key ? `?status=${key}` : ""}`,
    label,
    active: status === key || (!status && !key),
    count: all.filter((item) => !key || item.status === key).length,
  });
  void locale;
  return (
    <div>
      <PageIntro title={tx("Shipments")} />
      <Tabs items={[tab("", tx("All")), tab("shipped", tx("In transit")), tab("delivered", tx("Delivered"))]} />
      <Filters action="/shipments" q={q} placeholder={tx("Shipment, order, customer or tracking")} hidden={{ status }} />
      <Panel flush>
        <DataTable
          columns={[{ label: tx("Shipment") }, { label: tx("Customer") }, { label: tx("Order") }, { label: tx("Shipping") }, { label: tx("Date") }, { label: tx("Status") }]}
          rows={shipments.map((shipment) => ({
            key: shipment.id,
            href: `/shipments/${shipment.id}`,
            cells: [
              shipment.number,
              shipment.salesOrder.customer.name,
              <span key="o" className="text-muted">{shipment.salesOrder.number}</span>,
              <span key="c">
                {shipment.carrier === "Spedition" ? tx("Freight") : shipment.carrier}
                {shipment.trackingNumber ? <span className="ml-2 font-mono text-[12px] text-muted">{shipment.trackingNumber}</span> : null}
              </span>,
              <span key="d" className="text-muted">{formatDay(shipment.shippedAt)}</span>,
              <Status key="s" map={txMap(shipmentStatus, tx)} value={shipment.status} />,
            ],
          }))}
          empty={{ title: tx("No shipments"), body: tx("Shipping happens on the order.") }}
        />
      </Panel>
    </div>
  );
}
