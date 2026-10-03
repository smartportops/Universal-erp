"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { refresh, runAction } from "@/server/action";

const back = "/settings?section=wms";

export async function createPickProfile(formData: FormData) {
  await runAction(back, async () => {
    const session = await requirePermission("settings.write");
    const name = String(formData.get("name") || "").trim();
    if (!name) throw new Error("Name is missing.");
    const maxOrders = Math.max(1, Math.min(500, Number(formData.get("maxOrders") || 20) || 20));
    const maxLines = Math.max(0, Math.min(100, Number(formData.get("maxLines") || 0) || 0));
    const count = await prisma.pickProfile.count({ where: { organizationId: session.organization.id } });
    await prisma.pickProfile.create({
      data: {
        organizationId: session.organization.id,
        name,
        channel: String(formData.get("channel") || "").trim(),
        customerType: ["b2b", "b2c"].includes(String(formData.get("customerType"))) ? String(formData.get("customerType")) : "",
        maxOrders,
        maxLines,
        carrier: String(formData.get("carrier") || "DHL").trim() || "DHL",
        sortOrder: count,
      },
    });
    refresh();
    redirect(back + "&notice=" + encodeURIComponent("Pick profile created."));
  });
}

export async function deletePickProfile(formData: FormData) {
  await runAction(back, async () => {
    const session = await requirePermission("settings.write");
    await prisma.pickProfile.deleteMany({ where: { id: String(formData.get("id") || ""), organizationId: session.organization.id } });
    refresh();
    redirect(back + "&notice=" + encodeURIComponent("Pick profile deleted."));
  });
}
