export function signedInvoiceNet(invoice: { kind?: string; status: string; netCents: number }) {
  if (invoice.status === "cancelled" || invoice.status === "void") return 0;
  if (invoice.kind === "credit") return -invoice.netCents;
  if (!invoice.kind || invoice.kind === "invoice") return invoice.netCents;
  return 0;
}

export function invoiceOpenAmount(invoice: { kind?: string; status: string; totalCents: number; payments: { status: string; amountCents: number }[] }, creditedCents = 0) {
  if ((invoice.kind ?? "invoice") !== "invoice") return 0;
  if (!["issued", "partial"].includes(invoice.status)) return 0;
  const paid = invoice.payments.filter((payment) => payment.status === "settled").reduce((sum, payment) => sum + payment.amountCents, 0);
  return Math.max(invoice.totalCents - paid - creditedCents, 0);
}
