import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { one, qty } from "@/lib/format";
import { locationTypes, warehouseTypes } from "@/lib/labels";
import { getLocale, translator } from "@/lib/i18n-server";
import { addLocation } from "@/server/actions/inventory";
import { entityExtras } from "@/server/entity";
import { ActivityFeed, DetailLayout } from "@/components/entity-panel";
import { InlineEdit } from "@/components/inline-edit";
import { Banner, PageIntro, Panel, Pill, Properties } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tx = await translator();
  const { id } = await params;
  const warehouse = await prisma.warehouse.findUnique({ where: { id } });
  return { title: warehouse?.name ?? tx("Warehouse") };
}

const inputClass = "h-8 w-full rounded-md bg-surface px-2 text-[13px] outline-none ring-1 ring-line-strong placeholder:text-faint focus:ring-2 focus:ring-accent/40";

export default async function WarehousePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tx = await translator();
  const locale = await getLocale();
  void locale;
  const session = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const warehouse = await prisma.warehouse.findFirst({
    where: { id, organizationId: session.organization.id },
    include: { locations: { orderBy: { code: "asc" } } },
  });
  if (!warehouse) notFound();
  const [movements, extras] = await Promise.all([
    prisma.stockMovement.findMany({ where: { organizationId: session.organization.id, warehouseId: warehouse.id }, select: { locationId: true, quantity: true, variantId: true } }),
    entityExtras(session.organization.id, "warehouse", warehouse.id),
  ]);
  const onHand = new Map<string, number>();
  for (const movement of movements) onHand.set(movement.locationId, (onHand.get(movement.locationId) ?? 0) + movement.quantity);
  const total = movements.reduce((sum, movement) => sum + movement.quantity, 0);
  const writable = can(session.role, "settings.write");
  const locationOptions = Object.entries(locationTypes).map(([value, label]) => ({ value, label: tx(label) }));
  const edit = (field: string, value: string) => <InlineEdit entity="warehouse" id={warehouse.id} field={field} value={value} disabled={!writable} placeholder={tx("Add")} />;

  return (
    <div>
      <PageIntro
        back={{ href: "/warehouses", label: tx("Warehouses") }}
        eyebrow={warehouse.code}
        title={<InlineEdit entity="warehouse" id={warehouse.id} field="name" value={warehouse.name} disabled={!writable} textClassName="text-[22px] font-semibold tracking-[-0.02em]" />}
        badges={warehouse.isDefault ? <Pill tone="info">{tx("Default")}</Pill> : null}
      />
      <Banner error={one(query.error)} notice={one(query.notice)} />
      <DetailLayout
        side={
          <Panel title={tx("Address")}>
            <Properties
              items={[
                { label: tx("Type"), value: tx(warehouseTypes[warehouse.type] ?? warehouse.type) },
                { label: tx("Street"), value: edit("street", warehouse.street) },
                { label: tx("Postal code"), value: edit("postalCode", warehouse.postalCode) },
                { label: tx("City"), value: edit("city", warehouse.city) },
                { label: tx("Units"), value: <span className="font-medium">{qty(total)}</span> },
              ]}
            />
          </Panel>
        }
      >
        <Panel title={tx("Locations")} flush>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-y border-line bg-subtle text-left text-[12px] text-muted">
                <th className="py-2 pl-5 pr-3 font-medium">{tx("Code")}</th>
                <th className="px-3 py-2 font-medium">{tx("Name")}</th>
                <th className="px-3 py-2 font-medium">{tx("Type")}</th>
                <th className="py-2 pl-3 pr-5 text-right font-medium">{tx("Units")}</th>
              </tr>
            </thead>
            <tbody>
              {warehouse.locations.map((location) => (
                <tr key={location.id} className="border-b border-line last:border-0">
                  <td className="py-2 pl-5 pr-3 font-mono text-[12px]">{location.code}</td>
                  <td className="px-3 py-2"><InlineEdit entity="location" id={location.id} field="name" value={location.name} disabled={!writable} /></td>
                  <td className="w-48 px-3 py-2"><InlineEdit entity="location" id={location.id} field="type" type="select" value={location.type} options={locationOptions} disabled={!writable} /></td>
                  <td className="py-2 pl-3 pr-5 text-right font-medium tabular-nums">{qty(onHand.get(location.id) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {writable ? (
            <form action={addLocation} className="grid grid-cols-2 items-center gap-2 border-t border-line bg-subtle px-5 py-3 sm:grid-cols-[110px_1fr_170px_auto]">
              <input type="hidden" name="warehouseId" value={warehouse.id} />
              <input name="code" required placeholder={tx("Code")} className={`${inputClass} font-mono`} />
              <input name="name" required placeholder={tx("New location, e.g. shelf C")} className={inputClass} />
              <select name="type" className={inputClass}>
                {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <SubmitButton variant="secondary" size="sm">{tx("Add")}</SubmitButton>
            </form>
          ) : null}
        </Panel>
        <ActivityFeed entityType="warehouse" entityId={warehouse.id} activities={extras.activities} canComment={can(session.role, "comments.write")} returnTo={`/warehouses/${warehouse.id}`} />
      </DetailLayout>
    </div>
  );
}
