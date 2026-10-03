"use server";

import { randomBytes } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { refresh, runAction } from "@/server/action";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

async function ownProduct(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, organizationId } });
  if (!product) throw new Error("Product not found.");
  return product;
}

export async function uploadProductImages(formData: FormData) {
  const productId = String(formData.get("productId") || "");
  await runAction(`/products/${productId}`, async () => {
    const session = await requirePermission("catalog.write");
    await ownProduct(session.organization.id, productId);
    const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (files.length === 0) throw new Error("Choose an image first.");
    const last = await prisma.productImage.findFirst({ where: { productId }, orderBy: { position: "desc" } });
    let position = (last?.position ?? -1) + 1;
    const root = path.join(process.cwd(), "data", "uploads");
    for (const file of files) {
      if (!imageTypes.has(file.type)) throw new Error("Only JPG, PNG, WebP, GIF or AVIF.");
      if (file.size > 8_000_000) throw new Error("An image is larger than 8 MB.");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const storageKey = `${session.organization.id}/products/${productId}/${randomBytes(6).toString("hex")}-${safe}`;
      const full = path.join(root, storageKey);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, Buffer.from(await file.arrayBuffer()));
      await prisma.productImage.create({
        data: { organizationId: session.organization.id, productId, filename: file.name, mimeType: file.type, storageKey, position: position++ },
      });
    }
    refresh();
    redirect(`/products/${productId}?notice=` + encodeURIComponent(files.length === 1 ? "Image added." : "Images added."));
  });
}

export async function removeProductImage(formData: FormData) {
  const productId = String(formData.get("productId") || "");
  await runAction(`/products/${productId}`, async () => {
    const session = await requirePermission("catalog.write");
    const id = String(formData.get("id") || "");
    const image = await prisma.productImage.findFirst({ where: { id, productId, organizationId: session.organization.id } });
    if (!image) return;
    await prisma.productImage.delete({ where: { id } });
    const root = path.resolve(process.cwd(), "data", "uploads");
    const full = path.resolve(root, image.storageKey);
    if (full.startsWith(root + path.sep)) await unlink(full).catch(() => undefined);
    refresh();
    redirect(`/products/${productId}`);
  });
}

export async function makeCoverImage(formData: FormData) {
  const productId = String(formData.get("productId") || "");
  await runAction(`/products/${productId}`, async () => {
    const session = await requirePermission("catalog.write");
    const id = String(formData.get("id") || "");
    const images = await prisma.productImage.findMany({ where: { productId, organizationId: session.organization.id }, orderBy: { position: "asc" } });
    if (!images.some((image) => image.id === id)) return;
    const ordered = [images.find((image) => image.id === id)!, ...images.filter((image) => image.id !== id)];
    await Promise.all(ordered.map((image, index) => prisma.productImage.update({ where: { id: image.id }, data: { position: index } })));
    refresh();
    redirect(`/products/${productId}`);
  });
}

export async function addProductSupplier(formData: FormData) {
  const productId = String(formData.get("productId") || "");
  await runAction(`/products/${productId}`, async () => {
    const session = await requirePermission("catalog.write");
    await ownProduct(session.organization.id, productId);
    const supplierId = String(formData.get("supplierId") || "");
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId: session.organization.id } });
    if (!supplier) throw new Error("Supplier not found.");
    await prisma.productSupplier.upsert({
      where: { productId_supplierId: { productId, supplierId } },
      create: { productId, supplierId },
      update: {},
    });
    const variants = await prisma.productVariant.findMany({ where: { productId, preferredSupplierId: null } });
    if (variants.length) await prisma.productVariant.updateMany({ where: { productId, preferredSupplierId: null }, data: { preferredSupplierId: supplierId } });
    refresh();
    redirect(`/products/${productId}`);
  });
}

export async function removeProductSupplier(formData: FormData) {
  const productId = String(formData.get("productId") || "");
  await runAction(`/products/${productId}`, async () => {
    const session = await requirePermission("catalog.write");
    await ownProduct(session.organization.id, productId);
    const supplierId = String(formData.get("supplierId") || "");
    await prisma.productSupplier.deleteMany({ where: { productId, supplierId } });
    const remaining = await prisma.productSupplier.findFirst({ where: { productId }, orderBy: { createdAt: "asc" } });
    await prisma.productVariant.updateMany({ where: { productId, preferredSupplierId: supplierId }, data: { preferredSupplierId: remaining?.supplierId ?? null } });
    refresh();
    redirect(`/products/${productId}`);
  });
}
