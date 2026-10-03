import { prisma } from "@/lib/db";

export async function entityExtras(organizationId: string, entityType: string, entityId: string, also: { type: string; ids: string[] }[] = []) {
  const or = [{ entityType, entityId }, ...also.filter((item) => item.ids.length).map((item) => ({ entityType: item.type, entityId: { in: item.ids } }))];
  const [activities, definitions, values, files] = await Promise.all([
    prisma.activity.findMany({
      where: { organizationId, OR: or },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 14,
    }),
    prisma.customFieldDefinition.findMany({ where: { organizationId, entityType } }),
    prisma.customFieldValue.findMany({ where: { organizationId, entityId } }),
    prisma.attachment.findMany({ where: { organizationId, entityType, entityId }, orderBy: { createdAt: "desc" } }),
  ]);
  const valueByDefinition = new Map(values.map((value) => [value.definitionId, value.value]));
  return {
    activities: activities.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      at: item.createdAt,
      actor: item.actor?.name ?? null,
      kind: item.kind,
    })),
    fields: definitions.map((definition) => ({
      definitionId: definition.id,
      label: definition.label,
      value: valueByDefinition.get(definition.id) ?? "",
    })),
    files: files.map((file) => ({ id: file.id, filename: file.filename })),
  };
}
