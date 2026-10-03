"use server";

import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/format";
import { refresh, runAction } from "@/server/action";
import { readDate } from "@/server/forms";
import { bookVoucher, voidVoucher } from "@/server/domain/vouchers";

const allowed = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "application/xml", "text/xml"]);

export async function createVoucher(formData: FormData) {
  await runAction("/vouchers/new", async () => {
    const session = await requirePermission("finance.write");
    const file = formData.get("file");
    let stored: { filename: string; mimeType: string; storageKey: string } | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > 8_000_000) throw new Error("File is larger than 8 MB.");
      const mime = file.type || "application/octet-stream";
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowed.has(mime) && !["pdf", "png", "jpg", "jpeg", "webp", "gif", "xml"].includes(ext)) {
        throw new Error("Use a PDF, image or XML file.");
      }
      const id = randomBytes(8).toString("hex");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const storageKey = `${session.organization.id}/${id}-${safe}`;
      const root = path.join(process.cwd(), "data", "uploads");
      const full = path.join(root, storageKey);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, Buffer.from(await file.arrayBuffer()));
      stored = { filename: file.name, mimeType: mime, storageKey };
    }
    const gross = parseMoneyToCents(String(formData.get("gross") || ""));
    const direction = String(formData.get("direction") || "");
    if (direction !== "in" && direction !== "out") throw new Error("Direction is missing.");
    const issuedAt = readDate(formData, "issuedAt");
    if (!issuedAt) throw new Error("Date is invalid.");
    const voucher = await bookVoucher(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      direction,
      issuedAt,
      counterparty: String(formData.get("counterparty") || ""),
      reference: String(formData.get("reference") || ""),
      description: String(formData.get("description") || ""),
      grossCents: gross ?? 0,
      taxRateBps: Number(formData.get("taxRateBps") || 0),
      netAccountId: String(formData.get("netAccountId") || ""),
      taxAccountId: String(formData.get("taxAccountId") || ""),
      contraAccountId: String(formData.get("contraAccountId") || ""),
      file: stored,
    });
    refresh();
    redirect(`/vouchers/${voucher.id}?notice=` + encodeURIComponent("Voucher booked."));
  });
}

export async function voidVoucherAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/vouchers/${id}`, async () => {
    const session = await requirePermission("finance.write");
    await voidVoucher(prisma, { organizationId: session.organization.id, actorId: session.user.id, voucherId: id });
    refresh();
    redirect(`/vouchers/${id}?notice=` + encodeURIComponent("Voucher voided."));
  });
}

export async function createAccount(formData: FormData) {
  await runAction("/bookkeeping/accounts", async () => {
    const session = await requirePermission("finance.write");
    const code = String(formData.get("code") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const type = String(formData.get("type") || "");
    if (!/^[0-9A-Za-z][0-9A-Za-z.\-]{0,15}$/.test(code)) throw new Error("Account code is invalid.");
    if (!name) throw new Error("Account name is missing.");
    if (!["asset", "liability", "equity", "revenue", "expense"].includes(type)) throw new Error("Account type is missing.");
    const existing = await prisma.account.findFirst({ where: { organizationId: session.organization.id, code } });
    if (existing) throw new Error("This account already exists.");
    await prisma.account.create({ data: { organizationId: session.organization.id, code, name, type } });
    refresh();
    redirect("/bookkeeping/accounts?notice=" + encodeURIComponent("Account created."));
  });
}
