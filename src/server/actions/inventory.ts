"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { refresh, runAction } from "@/server/action";
import { adjustStock, transferStock } from "@/server/domain/commerce";
import { dictionary } from "@/i18n/dictionary";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export async function adjustStockAction(formData: FormData) {
  const back = String(formData.get("back") || "/stock");
  const target = back.startsWith("/") ? back : "/stock";
  await runAction(`/stock/adjust?back=${encodeURIComponent(target)}`, async () => {
    const session = await requirePermission("stock.write");
    const variantId = String(formData.get("variantId") || "");
    const location = await prisma.location.findFirst({
      where: { id: String(formData.get("locationId") || ""), warehouse: { organizationId: session.organization.id } },
    });
    if (!location) throw new Error("Storage location not found.");
    let quantity = Number(formData.get("quantity") || 0);
    const counted = formData.get("counted");
    if (counted != null && String(counted) !== "") {
      const value = Number(counted);
      if (!Number.isInteger(value) || value < 0) throw new Error("Counted quantity must be a whole number from 0.");
      const current = await prisma.stockMovement.aggregate({
        where: { organizationId: session.organization.id, variantId, locationId: location.id },
        _sum: { quantity: true },
      });
      quantity = value - (current._sum.quantity ?? 0);
      if (quantity === 0) throw new Error("Stock already matches, nothing to post.");
    }
    await adjustStock(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      variantId,
      warehouseId: location.warehouseId,
      locationId: location.id,
      quantity,
      reason: String(formData.get("reason") || ""),
    });
    refresh();
    const join = target.includes("?") ? "&" : "?";
    const sign = quantity > 0 ? `+${quantity}` : String(quantity);
    const notice = translate(await getLocale(), "Adjustment {delta} posted.", dictionary, { delta: sign });
    redirect(`${target}${join}notice=` + encodeURIComponent(notice));
  });
}

export async function transferStockAction(formData: FormData) {
  await runAction("/stock/transfer", async () => {
    const session = await requirePermission("stock.write");
    await transferStock(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      variantId: String(formData.get("variantId") || ""),
      fromLocationId: String(formData.get("fromLocationId") || ""),
      toLocationId: String(formData.get("toLocationId") || ""),
      quantity: Number(formData.get("quantity") || 0),
    });
    refresh();
    redirect("/stock?notice=" + encodeURIComponent("Transfer posted."));
  });
}

export async function createWarehouse(formData: FormData) {
  await runAction("/warehouses/new", async () => {
    const session = await requirePermission("settings.write");
    const code = String(formData.get("code") || "").trim().toUpperCase();
    const name = String(formData.get("name") || "").trim();
    if (!code || !name) throw new Error("Code and name are missing.");
    const warehouse = await prisma.warehouse.create({
      data: {
        organizationId: session.organization.id,
        code,
        name,
        type: String(formData.get("type") || "own"),
        city: String(formData.get("city") || "").trim(),
        country: "DE",
        locations: { create: { code: "PICK-01", name: "Picking", type: "pick" } },
      },
    });
    refresh();
    redirect(`/warehouses/${warehouse.id}`);
  });
}

export async function addLocation(formData: FormData) {
  const warehouseId = String(formData.get("warehouseId") || "");
  await runAction(`/warehouses/${warehouseId}`, async () => {
    const session = await requirePermission("settings.write");
    const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, organizationId: session.organization.id } });
    if (!warehouse) throw new Error("Warehouse not found.");
    await prisma.location.create({
      data: {
        warehouseId,
        code: String(formData.get("code") || "").trim(),
        name: String(formData.get("name") || "").trim(),
        type: String(formData.get("type") || "pick"),
      },
    });
    refresh();
    redirect(`/warehouses/${warehouseId}?notice=` + encodeURIComponent("Location created."));
  });
}
