"use server";

import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { isRole } from "@/lib/permissions";
import { refresh, runAction } from "@/server/action";
import { record } from "@/server/domain/platform";
import { dictionary } from "@/i18n/dictionary";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export async function addComment(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/");
  await runAction(returnTo, async () => {
    const session = await requirePermission("comments.write");
    const body = String(formData.get("body") || "").trim();
    const entityType = String(formData.get("entityType") || "");
    const entityId = String(formData.get("entityId") || "");
    if (!body) throw new Error("The note is empty.");
    await prisma.$transaction(async (tx) => {
      await tx.comment.create({
        data: { organizationId: session.organization.id, entityType, entityId, authorId: session.user.id, body },
      });
      await record(tx, {
        organizationId: session.organization.id,
        actorId: session.user.id,
        type: "comment.created",
        entityType,
        entityId,
        summary: "Note",
        body,
        kind: "comment",
      });
    });
    refresh();
    redirect(returnTo);
  });
}

export async function saveCustomField(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/");
  await runAction(returnTo, async () => {
    const session = await requireUser();
    const definitionId = String(formData.get("definitionId") || "");
    const entityId = String(formData.get("entityId") || "");
    const definition = await prisma.customFieldDefinition.findFirst({
      where: { id: definitionId, organizationId: session.organization.id },
    });
    if (!definition) throw new Error("Field not found.");
    await prisma.customFieldValue.upsert({
      where: { definitionId_entityId: { definitionId, entityId } },
      update: { value: String(formData.get("value") || "") },
      create: {
        organizationId: session.organization.id,
        definitionId,
        entityId,
        value: String(formData.get("value") || ""),
      },
    });
    refresh();
    redirect(`${returnTo}?notice=` + encodeURIComponent("Field saved."));
  });
}

export async function uploadAttachment(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/");
  await runAction(returnTo, async () => {
    const session = await requirePermission("comments.write");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("File is missing.");
    if (file.size > 5_000_000) throw new Error("File is larger than 5 MB.");
    const id = randomBytes(8).toString("hex");
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const storageKey = `${session.organization.id}/${id}-${safe}`;
    const root = path.join(process.cwd(), "data", "uploads");
    const full = path.join(root, storageKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, Buffer.from(await file.arrayBuffer()));
    await prisma.attachment.create({
      data: {
        organizationId: session.organization.id,
        entityType: String(formData.get("entityType") || ""),
        entityId: String(formData.get("entityId") || ""),
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        storageKey,
        createdById: session.user.id,
      },
    });
    refresh();
    redirect(`${returnTo}?notice=` + encodeURIComponent("File attached."));
  });
}

export async function saveCompany(formData: FormData) {
  await runAction("/settings?section=company", async () => {
    const session = await requirePermission("settings.write");
    await prisma.organization.update({
      where: { id: session.organization.id },
      data: {
        name: String(formData.get("name") || "").trim(),
        legalName: String(formData.get("legalName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        vatId: String(formData.get("vatId") || "").trim(),
        street: String(formData.get("street") || "").trim(),
        postalCode: String(formData.get("postalCode") || "").trim(),
        city: String(formData.get("city") || "").trim(),
      },
    });
    refresh();
    redirect("/settings?section=company&notice=" + encodeURIComponent("Company saved."));
  });
}

export async function inviteUser(formData: FormData) {
  await runAction("/settings?section=users", async () => {
    const session = await requirePermission("settings.write");
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const name = String(formData.get("name") || "").trim();
    const role = String(formData.get("role") || "viewer");
    const password = String(formData.get("password") || "");
    if (!email || !name || password.length < 8) throw new Error("Name, email and a password of 8 characters.");
    if (!isRole(role)) throw new Error("Role is invalid.");
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error("This email already exists.");
    const user = await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password) },
    });
    await prisma.membership.create({
      data: { organizationId: session.organization.id, userId: user.id, role },
    });
    refresh();
    redirect("/settings?section=users&notice=" + encodeURIComponent("User created."));
  });
}

export async function changeRole(formData: FormData) {
  await runAction("/settings?section=users", async () => {
    const session = await requirePermission("settings.write");
    const role = String(formData.get("role") || "");
    if (!isRole(role)) throw new Error("Role is invalid.");
    await prisma.membership.updateMany({
      where: { id: String(formData.get("membershipId") || ""), organizationId: session.organization.id },
      data: { role },
    });
    refresh();
    redirect("/settings?section=users&notice=" + encodeURIComponent("Role updated."));
  });
}

export async function addTax(formData: FormData) {
  await runAction("/settings?section=taxes", async () => {
    const session = await requirePermission("settings.write");
    const percent = Number(String(formData.get("percent") || "").replace(",", "."));
    if (!Number.isFinite(percent)) throw new Error("Rate is missing.");
    await prisma.taxRate.create({
      data: {
        organizationId: session.organization.id,
        name: String(formData.get("name") || "").trim(),
        rateBps: Math.round(percent * 100),
        isDefault: false,
      },
    });
    refresh();
    redirect("/settings?section=taxes&notice=" + encodeURIComponent("Tax rate created."));
  });
}

export async function updateSequence(formData: FormData) {
  await runAction("/settings?section=sequences", async () => {
    const session = await requirePermission("settings.write");
    await prisma.numberSequence.updateMany({
      where: { id: String(formData.get("id") || ""), organizationId: session.organization.id },
      data: {
        prefix: String(formData.get("prefix") || ""),
        nextNumber: Number(formData.get("nextNumber") || 1),
      },
    });
    refresh();
    redirect("/settings?section=sequences&notice=" + encodeURIComponent("Number sequence saved."));
  });
}

export async function createWebhook(formData: FormData) {
  await runAction("/settings?section=webhooks", async () => {
    const session = await requirePermission("settings.write");
    const events = String(formData.get("events") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    await prisma.webhookEndpoint.create({
      data: {
        organizationId: session.organization.id,
        url: String(formData.get("url") || "").trim(),
        events: JSON.stringify(events.length ? events : ["*"]),
        secret: randomBytes(16).toString("hex"),
      },
    });
    refresh();
    redirect("/settings?section=webhooks&notice=" + encodeURIComponent("The webhook is queued until a worker delivers it."));
  });
}

export async function createApiKey(_prev: { secret?: string; error?: string } | null, formData: FormData) {
  try {
    const session = await requirePermission("settings.write");
    const secret = `aera_${randomBytes(24).toString("hex")}`;
    const { createHash } = await import("crypto");
    await prisma.apiKey.create({
      data: {
        organizationId: session.organization.id,
        name: String(formData.get("name") || "Key").trim(),
        prefix: secret.slice(0, 12),
        hash: createHash("sha256").update(secret).digest("hex"),
      },
    });
    refresh();
    return { secret };
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Could not create the key.";
    return { error: translate(await getLocale(), message, dictionary) };
  }
}

export async function importProducts(formData: FormData) {
  await runAction("/settings?section=import", async () => {
    const session = await requirePermission("catalog.write");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("CSV is missing.");
    const rows = (await file.text())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(",").map((cell) => cell.trim()));
    const [header, ...body] = rows;
    const index = Object.fromEntries((header || []).map((key, position) => [key, position]));
    if (index.name == null || index.sku == null) throw new Error("Columns name and sku are required.");
    let count = 0;
    for (const row of body) {
      const name = row[index.name];
      const sku = row[index.sku];
      if (!name || !sku) continue;
      const price = Math.round(Number(row[index.price] || 0) * 100);
      const cost = Math.round(Number(row[index.cost] || 0) * 100);
      await prisma.product.create({
        data: {
          organizationId: session.organization.id,
          name,
          variants: {
            create: {
              organizationId: session.organization.id,
              sku,
              name: "Standard",
              ean: row[index.ean] || "",
              priceCents: Number.isFinite(price) ? price : 0,
              costCents: Number.isFinite(cost) ? cost : 0,
              reorderPoint: Number(row[index.reorderPoint] || 0),
            },
          },
        },
      });
      count += 1;
    }
    refresh();
    const notice = translate(await getLocale(), "{n} products imported.", dictionary, { n: count });
    redirect("/settings?section=import&notice=" + encodeURIComponent(notice));
  });
}

export async function addCustomField(formData: FormData) {
  await runAction("/settings?section=fields", async () => {
    const session = await requirePermission("settings.write");
    const label = String(formData.get("label") || "").trim();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!key) throw new Error("Name is missing.");
    await prisma.customFieldDefinition.create({
      data: {
        organizationId: session.organization.id,
        entityType: String(formData.get("entityType") || "product"),
        key,
        label,
        fieldType: "text",
      },
    });
    refresh();
    redirect("/settings?section=fields&notice=" + encodeURIComponent("Field created."));
  });
}

export async function startTotp() {
  const session = await requireUser();
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: session.user.id }, data: { totpSecret: secret, totpEnabled: false } });
  refresh();
  redirect("/settings?section=security&notice=" + encodeURIComponent(totpUri(session.user.email, secret)));
}

export async function confirmTotpSetup(formData: FormData) {
  await runAction("/settings?section=security", async () => {
    const session = await requireUser();
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.totpSecret || !verifyTotp(user.totpSecret, String(formData.get("code") || ""))) {
      throw new Error("The code does not match the key.");
    }
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    refresh();
    redirect("/settings?section=security&notice=" + encodeURIComponent("Two-factor authentication is on."));
  });
}

export async function disableTotp(formData: FormData) {
  await runAction("/settings?section=security", async () => {
    const session = await requireUser();
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.totpSecret || !verifyTotp(user.totpSecret, String(formData.get("code") || ""))) {
      throw new Error("Code is invalid.");
    }
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
    refresh();
    redirect("/settings?section=security&notice=" + encodeURIComponent("Two-factor authentication is off."));
  });
}

export async function saveView(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/");
  await runAction(returnTo, async () => {
    const session = await requireUser();
    await prisma.savedView.create({
      data: {
        organizationId: session.organization.id,
        userId: session.user.id,
        entityType: String(formData.get("entityType") || ""),
        name: String(formData.get("name") || "View").trim(),
        query: String(formData.get("query") || ""),
        shared: true,
      },
    });
    refresh();
    redirect(returnTo);
  });
}
