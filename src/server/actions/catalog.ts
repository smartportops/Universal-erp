"use server";

import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/db";
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

export async function archiveProducts(formData: FormData) {
  await runAction("/products", async () => {
    const session = await requirePermission("catalog.write");
    const ids = formData.getAll("ids").map(String).filter(Boolean);
    if (ids.length === 0) throw new Error("Nothing selected.");
    await prisma.product.updateMany({
      where: { organizationId: session.organization.id, id: { in: ids } },
      data: { status: "archived" },
    });
    refresh();
    redirect("/products?notice=" + encodeURIComponent("Archived."));
  });
}

export async function createSupplier(formData: FormData) {
  await runAction("/suppliers/new", async () => {
    const session = await requirePermission("purchasing.write");
    const name = String(formData.get("name") || "").trim();
    if (!name) throw new Error("Name is missing.");
    const existing = await prisma.supplier.findMany({ where: { organizationId: session.organization.id }, select: { code: true } });
    const supplier = await prisma.supplier.create({
      data: {
        organizationId: session.organization.id,
        code: await nextCode("LF-", existing.map((row) => row.code), 3),
        name,
        email: String(formData.get("email") || "").trim(),
        country: String(formData.get("country") || "DE").trim(),
        leadTimeDays: Number(formData.get("leadTimeDays") || 14),
        paymentTerms: String(formData.get("paymentTerms") || "30 days").trim(),
      },
    });
    refresh();
    redirect(`/suppliers/${supplier.id}?notice=` + encodeURIComponent("Supplier created."));
  });
}

export async function updateSupplier(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/suppliers/${id}`, async () => {
    const session = await requirePermission("purchasing.write");
    await prisma.supplier.updateMany({
      where: { id, organizationId: session.organization.id },
      data: {
        email: String(formData.get("email") || "").trim(),
        leadTimeDays: Number(formData.get("leadTimeDays") || 0),
        paymentTerms: String(formData.get("paymentTerms") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
      },
    });
    refresh();
    redirect(`/suppliers/${id}?notice=` + encodeURIComponent("Saved."));
  });
}

export async function createCustomer(formData: FormData) {
  await runAction("/customers/new", async () => {
    const session = await requirePermission("sales.write");
    const name = String(formData.get("name") || "").trim();
    if (!name) throw new Error("Name is missing.");
    const existing = await prisma.customer.findMany({ where: { organizationId: session.organization.id }, select: { code: true } });
    const customer = await prisma.customer.create({
      data: {
        organizationId: session.organization.id,
        code: await nextCode("KD-", existing.map((row) => row.code), 4),
        name,
        email: String(formData.get("email") || "").trim(),
        type: String(formData.get("type") || "b2c"),
        city: String(formData.get("city") || "").trim(),
        country: String(formData.get("country") || "DE").trim(),
        paymentTerms: String(formData.get("paymentTerms") || "Immediate").trim(),
        vatId: String(formData.get("vatId") || "").trim(),
      },
    });
    refresh();
    redirect(`/customers/${customer.id}?notice=` + encodeURIComponent("Customer created."));
  });
}

export async function updateCustomer(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/customers/${id}`, async () => {
    const session = await requirePermission("sales.write");
    await prisma.customer.updateMany({
      where: { id, organizationId: session.organization.id },
      data: {
        email: String(formData.get("email") || "").trim(),
        city: String(formData.get("city") || "").trim(),
        paymentTerms: String(formData.get("paymentTerms") || "").trim(),
        vatId: String(formData.get("vatId") || "").trim(),
      },
    });
    refresh();
    redirect(`/customers/${id}?notice=` + encodeURIComponent("Saved."));
  });
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
