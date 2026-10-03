"use server";

import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma, type Tx } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/format";
import { cleanHtml } from "@/lib/html";
import { messageFor, nextCode, refresh, runAction } from "@/server/action";
import { record } from "@/server/domain/platform";
import { readLines } from "@/server/forms";
import { dictionary } from "@/i18n/dictionary";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export type ProductDraftPayload = {
  name: string;
  status: string;
  category: string;
  taxRateId: string;
  description: string;
  allowOversell: boolean;
  trackSerialsIn: boolean;
  trackSerialsOut: boolean;
  variants: { id: string; name: string; sku: string; ean: string; price: string; cost: string; weight: string; reorder: string }[];
};

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function moneyField(raw: string) {
  const text = raw.trim();
  if (!text) return 0;
  const cents = parseMoneyToCents(text);
  if (cents == null) throw new Error("Enter prices like 49.90.");
  return cents;
}

function wholeField(raw: string) {
  const text = raw.trim();
  if (!text) return 0;
  const value = Number(text.replace(",", "."));
  if (!Number.isInteger(value) || value < 0) throw new Error("Enter a whole number.");
  return value;
}

function productData(payload: ProductDraftPayload, organizationId: string) {
  const name = payload.name.trim();
  if (!name) throw new Error("Give the product a title.");
  const status = payload.status === "active" || payload.status === "archived" ? payload.status : "draft";
  return {
    name,
    status,
    category: payload.category.trim(),
    description: cleanHtml(payload.description),
    allowOversell: payload.allowOversell,
    trackSerialsIn: payload.trackSerialsIn,
    trackSerialsOut: payload.trackSerialsOut,
    taxRateId: payload.taxRateId.trim() || null,
    organizationId,
  };
}

/** Writes the open product. Field edits stay in the browser until this runs. */
export async function saveProduct(productId: string, payload: ProductDraftPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requirePermission("catalog.write");
    const product = await prisma.product.findFirst({ where: { id: productId, organizationId: session.organization.id } });
    if (!product) return { ok: false, error: "Product not found." };
    const data = productData(payload, session.organization.id);
    if (data.taxRateId) {
      const rate = await prisma.taxRate.findFirst({ where: { id: data.taxRateId, organizationId: session.organization.id } });
      if (!rate) return { ok: false, error: "Tax rate not found." };
    }
    const variants = payload.variants.map((variant) => {
      const sku = variant.sku.trim();
      if (!sku) throw new Error("A SKU is required.");
      return {
        id: variant.id,
        name: variant.name.trim() || "Standard",
        sku,
        ean: variant.ean.trim(),
        priceCents: moneyField(variant.price),
        costCents: moneyField(variant.cost),
        weightGrams: wholeField(variant.weight),
        reorderPoint: wholeField(variant.reorder),
      };
    });
    await prisma.product.update({ where: { id: productId }, data });
    for (const variant of variants) {
      const { id, ...fields } = variant;
      await prisma.productVariant.updateMany({ where: { id, productId, organizationId: session.organization.id }, data: fields });
    }
    await record(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      type: "product.updated",
      entityType: "product",
      entityId: productId,
      summary: "Product saved.",
    });
    refresh();
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: messageFor(error) };
  }
}

/** Creates the product from the empty editor. Nothing is stored before this. */
export async function createProduct(formData: FormData): Promise<{ error: string } | void> {
  try {
    const session = await requirePermission("catalog.write");
    const payload: ProductDraftPayload = {
      name: String(formData.get("product:name") || ""),
      status: String(formData.get("product:status") || "draft"),
      category: String(formData.get("product:category") || ""),
      taxRateId: String(formData.get("product:taxRateId") || ""),
      description: String(formData.get("product:description") || ""),
      allowOversell: formData.get("product:allowOversell") === "true",
      trackSerialsIn: formData.get("product:trackSerialsIn") === "true",
      trackSerialsOut: formData.get("product:trackSerialsOut") === "true",
      variants: [],
    };
    const data = productData(payload, session.organization.id);
    if (data.taxRateId) {
      const rate = await prisma.taxRate.findFirst({ where: { id: data.taxRateId, organizationId: session.organization.id } });
      if (!rate) return { error: "Tax rate not found." };
    }
    let sku = String(formData.get("variant:new:sku") || "").trim();
    if (!sku) {
      const existing = await prisma.productVariant.findMany({
        where: { organizationId: session.organization.id, sku: { startsWith: "NEW-" } },
        select: { sku: true },
      });
      sku = await nextCode("NEW-", existing.map((variant) => variant.sku), 3);
    }
    const supplierIds = String(formData.get("supplierIds") || "").split(",").map((id) => id.trim()).filter(Boolean);
    const suppliers = supplierIds.length
      ? await prisma.supplier.findMany({ where: { id: { in: supplierIds }, organizationId: session.organization.id, status: "active" } })
      : [];
    const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    for (const file of files) {
      if (!imageTypes.has(file.type)) return { error: "Only JPG, PNG, WebP, GIF or AVIF." };
      if (file.size > 8_000_000) return { error: "An image is larger than 8 MB." };
    }
    const product = await prisma.product.create({
      data: {
        ...data,
        variants: {
          create: {
            organizationId: session.organization.id,
            sku,
            name: String(formData.get("variant:new:name") || "").trim() || "Standard",
            ean: String(formData.get("variant:new:ean") || "").trim(),
            priceCents: moneyField(String(formData.get("variant:new:price") || "")),
            costCents: moneyField(String(formData.get("variant:new:cost") || "")),
            weightGrams: wholeField(String(formData.get("variant:new:weight") || "")),
            reorderPoint: wholeField(String(formData.get("variant:new:reorder") || "")),
            preferredSupplierId: suppliers[0]?.id ?? null,
          },
        },
        suppliers: suppliers.length ? { create: suppliers.map((supplier) => ({ supplierId: supplier.id })) } : undefined,
      },
    });
    const root = path.join(process.cwd(), "data", "uploads");
    let position = 0;
    for (const file of files) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const storageKey = `${session.organization.id}/products/${product.id}/${randomBytes(6).toString("hex")}-${safe}`;
      await mkdir(path.dirname(path.join(root, storageKey)), { recursive: true });
      await writeFile(path.join(root, storageKey), Buffer.from(await file.arrayBuffer()));
      await prisma.productImage.create({
        data: { organizationId: session.organization.id, productId: product.id, filename: file.name, mimeType: file.type, storageKey, position: position++ },
      });
    }
    await record(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      type: "product.created",
      entityType: "product",
      entityId: product.id,
      summary: "Product created.",
    });
    refresh();
    redirect(`/products/${product.id}?notice=` + encodeURIComponent("Product created."));
  } catch (error) {
    unstable_rethrow(error);
    return { error: messageFor(error) };
  }
}

export async function updateProduct(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/products/${id}`, async () => {
    const session = await requirePermission("catalog.write");
    await prisma.product.updateMany({
      where: { id, organizationId: session.organization.id },
      data: {
        name: String(formData.get("name") || "").trim(),
        category: String(formData.get("category") || "").trim(),
        status: String(formData.get("status") || "active"),
        description: String(formData.get("description") || "").trim(),
      },
    });
    refresh();
    redirect(`/products/${id}?notice=` + encodeURIComponent("Saved."));
  });
}

export async function addVariant(formData: FormData) {
  const productId = String(formData.get("productId") || "");
  await runAction(`/products/${productId}`, async () => {
    const session = await requirePermission("catalog.write");
    const product = await prisma.product.findFirst({ where: { id: productId, organizationId: session.organization.id } });
    if (!product) throw new Error("Product not found.");
    const price = parseMoneyToCents(String(formData.get("price") || ""));
    const cost = parseMoneyToCents(String(formData.get("cost") || ""));
    const sku = String(formData.get("sku") || "").trim();
    if (!sku || price == null || cost == null) throw new Error("SKU and prices are missing.");
    await prisma.productVariant.create({
      data: {
        organizationId: session.organization.id,
        productId,
        sku,
        name: String(formData.get("name") || "Variant").trim(),
        ean: String(formData.get("ean") || "").trim(),
        priceCents: price,
        costCents: cost,
        reorderPoint: Number(formData.get("reorderPoint") || 0),
      },
    });
    refresh();
    redirect(`/products/${productId}?notice=` + encodeURIComponent("Variant created."));
  });
}
export type SupplierContactInput = { id: string; name: string; role: string; email: string; phone: string };
export type SupplierBankInput = { id: string; accountHolder: string; iban: string; bic: string; bankName: string };

export type SupplierPayload = {
  name: string;
  code: string;
  customerNumber: string;
  email: string;
  phone: string;
  website: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  language: string;
  currency: string;
  vatId: string;
  taxNumber: string;
  notes: string;
  leadTimeDays: string;
  paymentTerms: string;
  contacts: SupplierContactInput[];
  bankAccounts: SupplierBankInput[];
};

function supplierData(payload: SupplierPayload) {
  const pick = (value: string) => value.trim();
  const name = pick(payload.name);
  if (!name) throw new Error("Name is missing.");
  const rawDays = String(payload.leadTimeDays ?? "").trim().replace(",", ".");
  const parsedDays = rawDays === "" ? 14 : Number(rawDays);
  return {
    name,
    code: pick(payload.code),
    customerNumber: pick(payload.customerNumber),
    email: pick(payload.email),
    phone: pick(payload.phone),
    website: pick(payload.website),
    street: pick(payload.street),
    postalCode: pick(payload.postalCode),
    city: pick(payload.city),
    country: pick(payload.country) || "DE",
    language: pick(payload.language) || "de",
    currency: pick(payload.currency) || "EUR",
    vatId: pick(payload.vatId),
    taxNumber: pick(payload.taxNumber),
    notes: pick(payload.notes),
    leadTimeDays: Number.isFinite(parsedDays) && parsedDays >= 0 ? Math.round(parsedDays) : 14,
    paymentTerms: pick(payload.paymentTerms),
  };
}

function filledContacts(rows: SupplierContactInput[]) {
  return rows
    .map((row) => ({
      name: row.name.trim(),
      role: row.role.trim(),
      email: row.email.trim(),
      phone: row.phone.trim(),
    }))
    .filter((row) => row.name || row.role || row.email || row.phone)
    .map((row, position) => {
      if (!row.name) throw new Error("A contact needs a name.");
      return { ...row, position };
    });
}

function filledBanks(rows: SupplierBankInput[]) {
  return rows
    .map((row) => ({
      accountHolder: row.accountHolder.trim(),
      iban: row.iban.trim(),
      bic: row.bic.trim(),
      bankName: row.bankName.trim(),
    }))
    .filter((row) => row.accountHolder || row.iban || row.bic || row.bankName)
    .map((row, position) => {
      if (!row.iban) throw new Error("A bank account needs an IBAN.");
      return { ...row, position };
    });
}

async function writeSupplierRelations(tx: Tx, supplierId: string, payload: SupplierPayload) {
  const contacts = filledContacts(payload.contacts);
  const banks = filledBanks(payload.bankAccounts);
  await tx.supplierContact.deleteMany({ where: { supplierId } });
  await tx.supplierBankAccount.deleteMany({ where: { supplierId } });
  if (contacts.length) await tx.supplierContact.createMany({ data: contacts.map((row) => ({ supplierId, ...row })) });
  if (banks.length) await tx.supplierBankAccount.createMany({ data: banks.map((row) => ({ supplierId, ...row })) });
}

export async function createSupplier(payload: SupplierPayload): Promise<{ error: string } | undefined> {
  let id = "";
  try {
    const session = await requirePermission("purchasing.write");
    const data = supplierData(payload);
    const existing = await prisma.supplier.findMany({ where: { organizationId: session.organization.id }, select: { code: true } });
    const code = data.code || (await nextCode("LF-", existing.map((row) => row.code), 3));
    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: { organizationId: session.organization.id, ...data, code },
      });
      await writeSupplierRelations(tx, created.id, payload);
      await record(tx, {
        organizationId: session.organization.id,
        actorId: session.user.id,
        type: "supplier.created",
        entityType: "supplier",
        entityId: created.id,
        summary: "Supplier created.",
      });
      return created;
    });
    id = supplier.id;
  } catch (error) {
    unstable_rethrow(error);
    return { error: messageFor(error) };
  }
  refresh();
  redirect(`/suppliers/${id}?notice=` + encodeURIComponent("Supplier created."));
}

export async function saveSupplier(supplierId: string, payload: SupplierPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requirePermission("purchasing.write");
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId: session.organization.id } });
    if (!supplier) return { ok: false, error: "Supplier not found." };
    const data = supplierData(payload);
    const code = data.code || supplier.code;
    await prisma.$transaction(async (tx) => {
      await tx.supplier.update({ where: { id: supplier.id }, data: { ...data, code } });
      await writeSupplierRelations(tx, supplier.id, payload);
      await record(tx, {
        organizationId: session.organization.id,
        actorId: session.user.id,
        type: "supplier.updated",
        entityType: "supplier",
        entityId: supplier.id,
        summary: "Supplier saved.",
      });
    });
    refresh();
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: messageFor(error) };
  }
}

type CustomerField = "name" | "email" | "phone" | "company" | "type" | "street" | "addressLine2" | "postalCode" | "city" | "country" | "paymentTerms" | "vatId" | "taxNumber" | "notes";

function customerData(values: Record<string, string>) {
  const pick = (key: CustomerField) => String(values[key] ?? "").trim();
  const name = pick("name");
  if (!name) throw new Error("Name is missing.");
  const type = pick("type") || "b2c";
  if (!["b2c", "b2b"].includes(type)) throw new Error("Invalid value.");
  return {
    name,
    email: pick("email"),
    phone: pick("phone"),
    company: pick("company"),
    type,
    street: pick("street"),
    addressLine2: pick("addressLine2"),
    postalCode: pick("postalCode"),
    city: pick("city"),
    country: pick("country") || "DE",
    paymentTerms: pick("paymentTerms"),
    vatId: pick("vatId"),
    taxNumber: pick("taxNumber"),
    notes: pick("notes"),
  };
}

export async function createCustomer(values: Record<string, string>): Promise<{ error: string } | undefined> {
  let id = "";
  try {
    const session = await requirePermission("sales.write");
    const data = customerData(values);
    const existing = await prisma.customer.findMany({ where: { organizationId: session.organization.id }, select: { code: true } });
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { organizationId: session.organization.id, code: await nextCode("KD-", existing.map((row) => row.code), 4), ...data },
      });
      await record(tx, {
        organizationId: session.organization.id,
        actorId: session.user.id,
        type: "customer.created",
        entityType: "customer",
        entityId: created.id,
        summary: "Customer created.",
      });
      return created;
    });
    id = customer.id;
  } catch (error) {
    unstable_rethrow(error);
    return { error: messageFor(error) };
  }
  refresh();
  redirect(`/customers/${id}?notice=` + encodeURIComponent("Customer created."));
}

export async function saveCustomer(customerId: string, values: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requirePermission("sales.write");
    const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId: session.organization.id } });
    if (!customer) return { ok: false, error: "Customer not found." };
    const data = customerData(values);
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customer.id }, data });
      await record(tx, {
        organizationId: session.organization.id,
        actorId: session.user.id,
        type: "customer.updated",
        entityType: "customer",
        entityId: customer.id,
        summary: "Customer saved.",
      });
    });
    refresh();
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: messageFor(error) };
  }
}

export async function createPurchaseOrder(formData: FormData) {
  await runAction("/purchase-orders/new", async () => {
    const session = await requirePermission("purchasing.write");
    const { createPurchaseOrder: create } = await import("@/server/domain/commerce");
    const { readDate } = await import("@/server/forms");
    const lines = readLines(formData).map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
      unitCostCents: line.unitAmount ?? undefined,
    }));
    const order = await create(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      supplierId: String(formData.get("supplierId") || ""),
      warehouseId: String(formData.get("warehouseId") || ""),
      expectedAt: readDate(formData, "expectedAt"),
      notes: String(formData.get("notes") || ""),
      lines,
    });
    refresh();
    redirect(`/purchase-orders/${order.id}`);
  });
}

export async function createPurchaseFromSuggestions(formData: FormData) {
  await runAction("/reorder", async () => {
    const session = await requirePermission("purchasing.write");
    const { createPurchaseOrder: create } = await import("@/server/domain/commerce");
    const { readDate } = await import("@/server/forms");
    const lines: { variantId: string; quantity: number }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("qty_")) continue;
      const quantity = Math.floor(Number(value));
      if (Number.isFinite(quantity) && quantity > 0) lines.push({ variantId: key.slice(4), quantity });
    }
    if (lines.length === 0) throw new Error("No line with a quantity above 0.");
    const order = await create(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      supplierId: String(formData.get("supplierId") || ""),
      warehouseId: String(formData.get("warehouseId") || ""),
      expectedAt: readDate(formData, "expectedAt"),
      notes: "From reorder suggestions",
      lines,
    });
    refresh();
    const notice = translate(await getLocale(), "Draft with {n} lines created.", dictionary, { n: lines.length });
    redirect(`/purchase-orders/${order.id}?notice=` + encodeURIComponent(notice));
  });
}

export async function orderPurchase(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/purchase-orders/${id}`, async () => {
    const session = await requirePermission("purchasing.write");
    const { markPurchaseOrdered } = await import("@/server/domain/commerce");
    await markPurchaseOrdered(prisma, { organizationId: session.organization.id, actorId: session.user.id, purchaseOrderId: id });
    refresh();
    redirect(`/purchase-orders/${id}?notice=` + encodeURIComponent("Ordered."));
  });
}

export async function receivePurchase(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/purchase-orders/${id}`, async () => {
    const session = await requirePermission("stock.write");
    const { receivePurchaseOrder } = await import("@/server/domain/commerce");
    await receivePurchaseOrder(prisma, { organizationId: session.organization.id, actorId: session.user.id, purchaseOrderId: id });
    refresh();
    redirect(`/purchase-orders/${id}?notice=` + encodeURIComponent("Goods receipt posted."));
  });
}
