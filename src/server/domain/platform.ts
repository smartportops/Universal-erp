import type { Tx } from "@/lib/db";

type RecordInput = {
  organizationId: string;
  actorId?: string | null;
  type: string;
  entityType: string;
  entityId: string;
  summary: string;
  body?: string;
  metadata?: Record<string, unknown>;
  at?: Date;
  kind?: "system" | "comment";
  notify?: { title: string; body: string; href?: string; kind?: string };
};

export async function takeNumber(tx: Tx, organizationId: string, key: string) {
  const updated = await tx.numberSequence.update({
    where: { organizationId_key: { organizationId, key } },
    data: { nextNumber: { increment: 1 } },
  });
  const value = updated.nextNumber - 1;
  return `${updated.prefix}${String(value).padStart(updated.padding, "0")}`;
}

export async function queueWebhooks(tx: Tx, eventId: string, organizationId: string, type: string, at: Date) {
  const hooks = await tx.webhookEndpoint.findMany({
    where: { organizationId, active: true },
  });
  for (const hook of hooks) {
    const events = JSON.parse(hook.events) as string[];
    if (!events.includes("*") && !events.includes(type)) continue;
    await tx.webhookDelivery.create({
      data: { endpointId: hook.id, eventId, status: "queued", createdAt: at },
    });
  }
}

export async function record(tx: Tx, input: RecordInput) {
  const at = input.at ?? new Date();
  const metadata = JSON.stringify(input.metadata ?? {});
  const event = await tx.domainEvent.create({
    data: {
      organizationId: input.organizationId,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: metadata,
      createdAt: at,
    },
  });
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      action: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      metadata,
      createdAt: at,
    },
  });
  await tx.activity.create({
    data: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      kind: input.kind ?? "system",
      title: input.summary,
      body: input.body ?? "",
      actorId: input.actorId ?? null,
      createdAt: at,
    },
  });
  await queueWebhooks(tx, event.id, input.organizationId, input.type, at);
  if (input.notify) {
    await tx.notification.create({
      data: {
        organizationId: input.organizationId,
        kind: input.notify.kind ?? "info",
        title: input.notify.title,
        body: input.notify.body,
        href: input.notify.href,
        createdAt: at,
      },
    });
  }
  return event;
}

export async function defaultStockLocation(tx: Tx, warehouseId: string) {
  const locations = await tx.location.findMany({
    where: { warehouseId, active: true },
    orderBy: { code: "asc" },
  });
  const pick = locations.find((location) => location.type === "pick") ?? locations[0];
  if (!pick) throw new Error("Lager hat keinen Stellplatz.");
  return pick;
}

export async function defaultTaxBps(tx: Tx, organizationId: string) {
  const tax = await tx.taxRate.findFirst({
    where: { organizationId, isDefault: true },
  });
  return tax?.rateBps ?? 1900;
}

export async function addDocument(
  tx: Tx,
  input: {
    organizationId: string;
    title: string;
    kind: string;
    entityType: string;
    entityId: string;
    filename: string;
    at?: Date;
  },
) {
  await tx.document.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      filename: input.filename,
      createdAt: input.at ?? new Date(),
    },
  });
}
