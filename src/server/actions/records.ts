"use server";

import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { isRole, type Permission } from "@/lib/permissions";
import { parseDateInput, parseMoneyToCents } from "@/lib/format";
import { dictionary } from "@/i18n/dictionary";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { refresh } from "@/server/action";
import { record } from "@/server/domain/platform";
import { cleanHtml, htmlToText } from "@/lib/html";

export type UpdateResult = { ok: true } | { ok: false; error: string };

type Parser = (raw: string) => unknown;

const text: Parser = (raw) => raw.trim();
const required: Parser = (raw) => {
  const value = raw.trim();
  if (!value) throw new Error("Cannot be empty.");
  return value;
};
const int: Parser = (raw) => {
  const value = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(value) || value < 0) throw new Error("Enter a number from 0.");
  return Math.round(value);
};
const cents: Parser = (raw) => {
  const value = parseMoneyToCents(raw);
  if (value == null || value < 0) throw new Error("Enter an amount like 49.90.");
  return value;
};
const date: Parser = (raw) => (raw.trim() ? parseDateInput(raw.trim()) : null);
const oneOf = (values: string[]): Parser => (raw) => {
  if (!values.includes(raw)) throw new Error("Invalid value.");
  return raw;
};
const bool: Parser = (raw) => raw === "true" || raw === "1" || raw === "on";
const html: Parser = (raw) => cleanHtml(raw);
const optionalId: Parser = (raw) => (raw.trim() ? raw.trim() : null);

type Spec = {
  permission: Permission;
  activityType: string;
  fields: Record<string, { label: string; parse: Parser; display?: (value: unknown, organizationId: string) => Promise<string> }>;
  load: (organizationId: string, id: string) => Promise<Record<string, unknown> | null>;
  save: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  activityId?: (row: Record<string, unknown>) => string;
};

const specs: Record<string, Spec> = {
  product: {
    permission: "catalog.write",
    activityType: "product",
    fields: {
      name: { label: "Name", parse: required },
      category: { label: "Category", parse: text },
      description: { label: "Description", parse: html, display: async (value) => show(htmlToText(String(value ?? ""))) },
      status: { label: "Status", parse: oneOf(["active", "draft", "archived"]) },
      allowOversell: { label: "Allow overselling", parse: bool },
      trackSerialsIn: { label: "Serial numbers on receipt", parse: bool },
      trackSerialsOut: { label: "Serial numbers on dispatch", parse: bool },
      taxRateId: {
        label: "Tax rate",
        parse: optionalId,
        display: async (value, organizationId) => {
          if (!value) return "empty";
          const rate = await prisma.taxRate.findFirst({ where: { id: String(value), organizationId }, select: { name: true } });
          return rate?.name ?? String(value);
        },
      },
    },
    load: (organizationId, id) => prisma.product.findFirst({ where: { id, organizationId } }),
    save: async (id, data) => {
      if (typeof data.taxRateId === "string") {
        const product = await prisma.product.findUnique({ where: { id }, select: { organizationId: true } });
        const rate = await prisma.taxRate.findFirst({ where: { id: data.taxRateId, organizationId: product?.organizationId } });
        if (!rate) throw new Error("Tax rate not found.");
      }
      return prisma.product.update({ where: { id }, data });
    },
  },
  variant: {
    permission: "catalog.write",
    activityType: "product",
    fields: {
      name: { label: "Variant", parse: required },
      sku: { label: "SKU", parse: required },
      ean: { label: "EAN", parse: text },
      priceCents: { label: "Price", parse: cents },
      costCents: { label: "Cost", parse: cents },
      reorderPoint: { label: "Reorder point", parse: int },
      reorderQty: { label: "Reorder quantity", parse: int },
      weightGrams: { label: "Weight", parse: int },
    },
    load: (organizationId, id) => prisma.productVariant.findFirst({ where: { id, organizationId } }),
    save: (id, data) => prisma.productVariant.update({ where: { id }, data }),
    activityId: (row) => String(row.productId),
  },
  customer: {
    permission: "sales.write",
    activityType: "customer",
    fields: {
      name: { label: "Name", parse: required },
      email: { label: "Email", parse: text },
      phone: { label: "Phone", parse: text },
      company: { label: "Company", parse: text },
      type: { label: "Type", parse: oneOf(["b2c", "b2b"]) },
      street: { label: "Street", parse: text },
      addressLine2: { label: "Address line 2", parse: text },
      postalCode: { label: "Postal code", parse: text },
      city: { label: "City", parse: text },
      country: { label: "Country", parse: text },
      paymentTerms: { label: "Payment terms", parse: text },
      vatId: { label: "VAT ID", parse: text },
      taxNumber: { label: "Tax number", parse: text },
      notes: { label: "Notes", parse: text },
    },
    load: (organizationId, id) => prisma.customer.findFirst({ where: { id, organizationId } }),
    save: (id, data) => prisma.customer.update({ where: { id }, data }),
  },
  supplier: {
    permission: "purchasing.write",
    activityType: "supplier",
    fields: {
      name: { label: "Name", parse: required },
      email: { label: "Email", parse: text },
      country: { label: "Country", parse: text },
      leadTimeDays: { label: "Lead time", parse: int },
      paymentTerms: { label: "Payment terms", parse: text },
      notes: { label: "Note", parse: text },
    },
    load: (organizationId, id) => prisma.supplier.findFirst({ where: { id, organizationId } }),
    save: (id, data) => prisma.supplier.update({ where: { id }, data }),
  },
  warehouse: {
    permission: "settings.write",
    activityType: "warehouse",
    fields: {
      name: { label: "Name", parse: required },
      street: { label: "Street", parse: text },
      postalCode: { label: "Postal code", parse: text },
      city: { label: "City", parse: text },
    },
    load: (organizationId, id) => prisma.warehouse.findFirst({ where: { id, organizationId } }),
    save: (id, data) => prisma.warehouse.update({ where: { id }, data }),
  },
  location: {
    permission: "settings.write",
    activityType: "warehouse",
    fields: {
      name: { label: "Location", parse: required },
      type: { label: "Type", parse: oneOf(["pick", "bulk", "receiving", "returns", "quarantine"]) },
    },
    load: (organizationId, id) => prisma.location.findFirst({ where: { id, warehouse: { organizationId } } }),
    save: (id, data) => prisma.location.update({ where: { id }, data }),
    activityId: (row) => String(row.warehouseId),
  },
  sales_order: {
    permission: "sales.write",
    activityType: "sales_order",
    fields: {
      promisedAt: { label: "Promise date", parse: date },
      externalRef: { label: "Reference", parse: text },
      notes: { label: "Note", parse: text },
    },
    load: (organizationId, id) => prisma.salesOrder.findFirst({ where: { id, organizationId } }),
    save: (id, data) => prisma.salesOrder.update({ where: { id }, data }),
  },
  purchase_order: {
    permission: "purchasing.write",
    activityType: "purchase_order",
    fields: {
      expectedAt: { label: "Expected", parse: date },
      notes: { label: "Note", parse: text },
    },
    load: (organizationId, id) => prisma.purchaseOrder.findFirst({ where: { id, organizationId } }),
    save: (id, data) => prisma.purchaseOrder.update({ where: { id }, data }),
  },
  organization: {
    permission: "settings.write",
    activityType: "organization",
    fields: {
      name: { label: "Name", parse: required },
      legalName: { label: "Legal name", parse: required },
      email: { label: "Email", parse: text },
      phone: { label: "Phone", parse: text },
      vatId: { label: "VAT ID", parse: text },
      street: { label: "Street", parse: text },
      postalCode: { label: "Postal code", parse: text },
      city: { label: "City", parse: text },
    },
    load: (organizationId, id) => (id === organizationId ? prisma.organization.findUnique({ where: { id } }) : Promise.resolve(null)),
    save: (id, data) => prisma.organization.update({ where: { id }, data }),
  },
  sequence: {
    permission: "settings.write",
    activityType: "organization",
    fields: {
      prefix: { label: "Prefix", parse: text },
      nextNumber: { label: "Next number", parse: int },
    },
    load: (organizationId, id) => prisma.numberSequence.findFirst({ where: { id, organizationId } }),
    save: (id, data) => prisma.numberSequence.update({ where: { id }, data }),
    activityId: (row) => String(row.organizationId),
  },
  membership: {
    permission: "settings.write",
    activityType: "organization",
    fields: {
      role: {
        label: "Role",
        parse: (raw) => {
          if (!isRole(raw)) throw new Error("Unknown role.");
          return raw;
        },
      },
    },
    load: (organizationId, id) => prisma.membership.findFirst({ where: { id, organizationId } }),
    save: (id, data) => prisma.membership.update({ where: { id }, data }),
    activityId: (row) => String(row.organizationId),
  },
};

function show(value: unknown) {
  if (value == null || value === "") return "empty";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "string" && value.length > 120) return value.slice(0, 117) + "...";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function updateRecord(entity: string, id: string, field: string, raw: string): Promise<UpdateResult> {
  try {
    const spec = specs[entity];
    const config = spec?.fields[field];
    if (!spec || !config) return { ok: false, error: "This field cannot be edited." };
    const session = await requirePermission(spec.permission);
    const row = await spec.load(session.organization.id, id);
    if (!row) return { ok: false, error: "Not found." };
    if (entity === "membership" && row.userId === session.user.id) {
      return { ok: false, error: "You cannot change your own role." };
    }
    const value = config.parse(raw);
    const before = row[field];
    if (show(before) === show(value)) return { ok: true };
    await spec.save(id, { [field]: value });
    const locale = await getLocale();
    const shown = async (item: unknown) => {
      const text = config.display ? await config.display(item, session.organization.id) : show(item);
      return text === "empty" || text === "on" || text === "off" ? translate(locale, text, dictionary) : text;
    };
    const [beforeText, afterText] = await Promise.all([shown(before), shown(value)]);
    await record(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      type: `${entity}.updated`,
      entityType: spec.activityType,
      entityId: spec.activityId ? spec.activityId(row) : id,
      summary: `${config.label} changed`,
      body: `${beforeText} → ${afterText}`,
      metadata: { field, before: beforeText, after: afterText },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Could not save.";
    if (message.includes("Unique constraint")) return { ok: false, error: "This value is already taken." };
    return { ok: false, error: message };
  }
}

export async function updateCustomValue(definitionId: string, entityId: string, raw: string): Promise<UpdateResult> {
  try {
    const session = await requirePermission("comments.write");
    const definition = await prisma.customFieldDefinition.findFirst({
      where: { id: definitionId, organizationId: session.organization.id },
    });
    if (!definition) return { ok: false, error: "Field not found." };
    const value = raw.trim();
    await prisma.customFieldValue.upsert({
      where: { definitionId_entityId: { definitionId, entityId } },
      create: { organizationId: session.organization.id, definitionId, entityId, value },
      update: { value },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not save." };
  }
}
