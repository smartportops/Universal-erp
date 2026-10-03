"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/format";
import { refresh, runAction } from "@/server/action";
import { readDate } from "@/server/forms";
import { issueInvoice, settlePayment } from "@/server/domain/commerce";

export async function issueInvoiceAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/sales-orders/${id}`, async () => {
    const session = await requirePermission("finance.write");
    const invoice = await issueInvoice(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      salesOrderId: id,
      dueAt: readDate(formData, "dueAt"),
    });
    refresh();
    redirect(`/invoices/${invoice.id}`);
  });
}

export async function payInvoice(formData: FormData) {
  const id = String(formData.get("id") || "");
  await runAction(`/invoices/${id}`, async () => {
    const session = await requirePermission("finance.write");
    const amount = parseMoneyToCents(String(formData.get("amount") || ""));
    if (amount == null) throw new Error("Amount is missing.");
    await settlePayment(prisma, {
      organizationId: session.organization.id,
      actorId: session.user.id,
      invoiceId: id,
      amountCents: amount,
      method: String(formData.get("method") || "bank"),
      reference: String(formData.get("reference") || ""),
    });
    refresh();
    redirect(`/invoices/${id}?notice=` + encodeURIComponent("Payment recorded."));
  });
}
