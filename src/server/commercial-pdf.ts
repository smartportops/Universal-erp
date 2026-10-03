import { prisma } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { renderCommercialPdf, type CommercialPdf } from "@/server/pdf";

type Locale = "de" | "en";

const titles: Record<string, Record<Locale, string>> = {
  invoice: { de: "Rechnung", en: "Invoice" },
  cancellation: { de: "Stornorechnung", en: "Cancellation invoice" },
  credit: { de: "Rechnungskorrektur", en: "Credit note" },
  credit_cancellation: { de: "Stornorechnungskorrektur", en: "Cancellation of credit note" },
  quote: { de: "Angebot", en: "Quote" },
  delivery_note: { de: "Lieferschein", en: "Delivery note" },
};

function address(party: { street?: string | null; addressLine2?: string | null; postalCode?: string | null; city?: string | null; country?: string | null }) {
  return [party.street ?? "", party.addressLine2 ?? "", [party.postalCode, party.city].filter(Boolean).join(" "), party.country ?? ""].filter((line) => line && line.trim());
}

function sellerFrom(org: { legalName: string; name: string; street: string | null; postalCode: string | null; city: string | null; country: string; email: string | null; phone: string | null; vatId: string | null; taxNumber: string; iban: string; bic: string; bankName: string; accountHolder: string }) {
  return {
    name: org.legalName || org.name,
    lines: address(org),
    extra: [org.email ?? "", org.phone ?? "", org.vatId ? `USt-IdNr. ${org.vatId}` : "", org.taxNumber ? `Steuernr. ${org.taxNumber}` : ""].filter(Boolean),
    bank: { holder: org.accountHolder || org.legalName || org.name, bank: org.bankName, iban: org.iban, bic: org.bic },
  };
}

export async function invoicePdf(organizationId: string, invoiceId: string, locale: Locale) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { customer: true, lines: true, salesOrder: { include: { shipments: true } }, corrects: true, organization: true },
  });
  if (!invoice) return null;
  const org = invoice.organization;
  const seller = sellerFrom(org);
  const shippedAt = invoice.salesOrder?.shipments.find((shipment) => shipment.shippedAt)?.shippedAt;
  const service = shippedAt ?? invoice.salesOrder?.orderedAt ?? invoice.issuedAt;
  const kind = invoice.kind || "invoice";
  const note = invoice.corrects
    ? locale === "de"
      ? `Bezieht sich auf ${titles[invoice.corrects.kind]?.de ?? "Beleg"} ${invoice.corrects.number} vom ${formatDay(invoice.corrects.issuedAt)}.`
      : `Refers to ${titles[invoice.corrects.kind]?.en ?? "document"} ${invoice.corrects.number} dated ${formatDay(invoice.corrects.issuedAt)}.`
    : undefined;
  const input: CommercialPdf = {
    locale,
    title: titles[kind]?.[locale] ?? kind,
    number: invoice.number,
    issued: formatDay(invoice.issuedAt),
    due: invoice.dueAt ? formatDay(invoice.dueAt) : undefined,
    seller: { name: seller.name, lines: seller.lines, extra: seller.extra },
    buyer: {
      name: invoice.customer.company || invoice.customer.name,
      lines: address(invoice.customer),
      extra: [invoice.customer.company ? invoice.customer.name : "", invoice.customer.email, invoice.customer.vatId ? `USt-IdNr. ${invoice.customer.vatId}` : ""].filter(Boolean),
    },
    references: [
      invoice.salesOrder ? { label: locale === "de" ? "Auftrag" : "Order", value: invoice.salesOrder.number } : null,
      invoice.salesOrder?.externalRef ? { label: locale === "de" ? "Referenz" : "Reference", value: invoice.salesOrder.externalRef } : null,
      service ? { label: locale === "de" ? "Lieferdatum" : "Delivery date", value: formatDay(service) } : null,
    ].filter((item): item is { label: string; value: string } => !!item),
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      taxRateBps: line.taxRateBps,
      totalCents: line.quantity * line.unitPriceCents,
    })),
    netCents: invoice.netCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    currency: invoice.currency,
    note,
    bank: kind === "invoice" ? seller.bank : undefined,
    footer: locale === "de"
      ? "Maschinell erstellt und ohne Unterschrift gültig."
      : "Issued electronically and valid without a signature.",
  };
  return { filename: `${invoice.number}.pdf`, body: await renderCommercialPdf(input) };
}

export async function quotePdf(organizationId: string, quoteId: string, locale: Locale) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId },
    include: { customer: true, lines: true, salesOrder: true, organization: true },
  });
  if (!quote) return null;
  const seller = sellerFrom(quote.organization);
  const input: CommercialPdf = {
    locale,
    title: titles.quote[locale],
    number: quote.number,
    issued: formatDay(quote.issuedAt),
    seller: { name: seller.name, lines: seller.lines, extra: seller.extra },
    buyer: { name: quote.customer.company || quote.customer.name, lines: address(quote.customer), extra: [quote.customer.email].filter(Boolean) },
    references: [quote.salesOrder ? { label: locale === "de" ? "Auftrag" : "Order", value: quote.salesOrder.number } : { label: "", value: "" }].filter((item) => item.value),
    lines: quote.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      taxRateBps: line.taxRateBps,
      totalCents: line.quantity * line.unitPriceCents,
    })),
    netCents: quote.netCents,
    taxCents: quote.taxCents,
    totalCents: quote.totalCents,
    currency: quote.currency,
    note: locale === "de" ? "Unverbindliches Angebot, gültig 14 Tage." : "Quote, valid for 14 days.",
    footer: locale === "de" ? "Dies ist kein Steuerbeleg." : "This is not a tax invoice.",
  };
  return { filename: `${quote.number}.pdf`, body: await renderCommercialPdf(input) };
}

export async function deliveryNotePdf(organizationId: string, orderId: string, locale: Locale) {
  const order = await prisma.salesOrder.findFirst({
    where: { id: orderId, organizationId },
    include: { customer: true, lines: { include: { variant: { include: { product: true } } } }, shipments: true, organization: true },
  });
  if (!order) return null;
  const seller = sellerFrom(order.organization);
  const shipment = order.shipments[0];
  const input: CommercialPdf = {
    locale,
    title: titles.delivery_note[locale],
    number: shipment?.number ?? order.number,
    issued: formatDay(shipment?.shippedAt ?? order.orderedAt),
    seller: { name: seller.name, lines: seller.lines, extra: seller.extra },
    buyer: { name: order.customer.company || order.customer.name, lines: address(order.customer) },
    references: [
      { label: locale === "de" ? "Auftrag" : "Order", value: order.number },
      shipment?.carrier ? { label: locale === "de" ? "Versand" : "Carrier", value: [shipment.carrier, shipment.trackingNumber].filter(Boolean).join(" ") } : { label: "", value: "" },
    ].filter((item) => item.value),
    lines: order.lines.map((line) => ({
      description: `${line.variant.product.name} · ${line.variant.sku}`,
      quantity: line.shippedQty || line.quantity,
      unitPriceCents: line.unitPriceCents,
      taxRateBps: line.taxRateBps,
      totalCents: (line.shippedQty || line.quantity) * line.unitPriceCents,
    })),
    netCents: 0,
    taxCents: 0,
    totalCents: 0,
    currency: order.currency,
    note: locale === "de" ? "Lieferschein ohne Preise. Die Rechnung folgt gesondert." : "Delivery note without prices. The invoice follows separately.",
    footer: "",
    hideAmounts: true,
  };
  return { filename: `${input.number}.pdf`, body: await renderCommercialPdf(input) };
}
