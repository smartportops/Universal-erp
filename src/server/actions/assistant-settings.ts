"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { seal } from "@/lib/secret";
import { refresh, runAction } from "@/server/action";

const providers = ["openai", "anthropic", "xai"];

export async function saveAssistant(formData: FormData) {
  await runAction("/settings?section=assistant", async () => {
    const session = await requirePermission("settings.write");
    const provider = String(formData.get("provider") || "");
    if (!providers.includes(provider)) throw new Error("Unknown provider.");
    const clear = formData.get("clear") === "1";
    const apiKey = String(formData.get("apiKey") || "").trim();
    const current = await prisma.organization.findUniqueOrThrow({ where: { id: session.organization.id }, select: { aiKeyCipher: true } });
    const cipher = clear ? "" : apiKey ? seal(apiKey) : current.aiKeyCipher;
    if (!clear && !cipher) throw new Error("Add an API key.");
    await prisma.organization.update({
      where: { id: session.organization.id },
      data: { aiProvider: clear ? "" : provider, aiKeyCipher: cipher },
    });
    refresh();
    redirect("/settings?section=assistant&notice=" + encodeURIComponent(clear ? "Assistant key removed." : "Assistant saved."));
  });
}
