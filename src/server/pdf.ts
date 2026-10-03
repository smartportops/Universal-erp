import PDFDocument from "pdfkit";
import { money } from "@/lib/format";

type Party = {
  name: string;
  lines: string[];
  email?: string;
  vatId?: string;
  taxNumber?: string;
  extra?: string[];
};

type DocLine = { description: string; quantity: number; unitPriceCents: number; taxRateBps: number; totalCents: number };

export type CommercialPdf = {
  locale: "de" | "en";
  title: string;
  number: string;
  issued: string;
  due?: string;
  seller: Party;
  buyer: Party;
  references: { label: string; value: string }[];
  lines: DocLine[];
  netCents: number;
  taxCents: number;
  totalCents: number;
  currency?: string;
  note?: string;
  bank?: { holder: string; bank: string; iban: string; bic: string };
  footer: string;
  hideAmounts?: boolean;
};

function buffer(draw: (doc: PDFKit.PDFDocument) => void) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    draw(doc);
    doc.end();
  });
}

function partyBlock(doc: PDFKit.PDFDocument, party: Party, x: number, y: number, width: number) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111114").text(party.name || "—", x, y, { width });
  doc.font("Helvetica").fontSize(9).fillColor("#3f3f46");
  let cursor = doc.y;
  for (const line of party.lines.filter(Boolean)) {
    doc.text(line, x, cursor, { width });
    cursor = doc.y;
  }
  for (const line of party.extra ?? []) {
    if (!line) continue;
    doc.text(line, x, cursor, { width });
    cursor = doc.y;
  }
  return cursor;
}

export function renderCommercialPdf(input: CommercialPdf) {
  const currency = input.currency ?? "EUR";
  return buffer((doc) => {
    doc.fillColor("#111114").font("Helvetica-Bold").fontSize(20).text(input.title, 48, 48, { width: 280 });
    doc.font("Helvetica").fontSize(10).fillColor("#3f3f46").text(input.number, 48, 76);

    const sellerBottom = partyBlock(doc, input.seller, 340, 48, 210);
    const buyerTop = Math.max(120, sellerBottom + 28);
    doc.font("Helvetica").fontSize(8).fillColor("#71717a").text(input.seller.name, 48, buyerTop - 14, { width: 240 });
    partyBlock(doc, input.buyer, 48, buyerTop, 240);

    let y = 250;
    doc.font("Helvetica").fontSize(9).fillColor("#3f3f46");
    const meta = [
      { label: input.locale === "de" ? "Belegdatum" : "Document date", value: input.issued },
      input.due ? { label: input.locale === "de" ? "Fällig" : "Due", value: input.due } : null,
      ...input.references,
    ].filter((item): item is { label: string; value: string } => !!item && !!item.value);
    for (const item of meta) {
      doc.font("Helvetica").fillColor("#71717a").text(item.label, 340, y, { width: 90 });
      doc.font("Helvetica").fillColor("#111114").text(item.value, 430, y, { width: 120 });
      y += 16;
    }

    y = Math.max(y + 20, 340);
    const priced = !input.hideAmounts;
    const columns = priced ? [48, 280, 340, 410, 500] : [48, 460];
    const headers = priced
      ? input.locale === "de" ? ["Beschreibung", "Menge", "Preis", "USt", "Betrag"] : ["Description", "Qty", "Price", "VAT", "Amount"]
      : input.locale === "de" ? ["Beschreibung", "Menge"] : ["Description", "Qty"];
    doc.moveTo(48, y).lineTo(547, y).strokeColor("#e4e4e7").stroke();
    y += 8;
    doc.font("Helvetica").fontSize(8).fillColor("#71717a");
    headers.forEach((header, index) => doc.text(header, columns[index], y, { width: index === 0 ? 220 : 60, align: index === 0 ? "left" : "right" }));
    y += 16;
    doc.moveTo(48, y).lineTo(547, y).strokeColor("#e4e4e7").stroke();
    y += 8;
    doc.font("Helvetica").fontSize(9).fillColor("#111114");
    for (const line of input.lines) {
      if (y > 720) {
        doc.addPage();
        y = 48;
      }
      doc.text(line.description, columns[0], y, { width: priced ? 220 : 400 });
      const row = doc.y;
      doc.text(String(line.quantity), columns[1], y, { width: priced ? 50 : 80, align: "right" });
      if (priced) {
        const rate = (line.taxRateBps / 100).toLocaleString(input.locale === "de" ? "de-DE" : "en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " %";
        doc.text(money(line.unitPriceCents, currency), columns[2], y, { width: 60, align: "right" });
        doc.text(rate, columns[3], y, { width: 50, align: "right" });
        doc.text(money(line.totalCents, currency), columns[4], y, { width: 47, align: "right" });
      }
      y = Math.max(row, y + 14) + 8;
    }
    y += 8;
    if (!priced) {
      if (input.note) doc.font("Helvetica").fontSize(9).fillColor("#3f3f46").text(input.note, 48, y + 12, { width: 500 });
      doc.font("Helvetica").fontSize(8).fillColor("#71717a").text(input.footer, 48, 780, { width: 500, align: "center" });
      return;
    }
    doc.moveTo(320, y).lineTo(547, y).strokeColor("#e4e4e7").stroke();
    y += 10;
    const totals = [
      [input.locale === "de" ? "Netto" : "Net", money(input.netCents, currency)],
      [input.locale === "de" ? "Steuer" : "Tax", money(input.taxCents, currency)],
      [input.locale === "de" ? "Summe" : "Total", money(input.totalCents, currency)],
    ];
    totals.forEach((row, index) => {
      doc.font(index === 2 ? "Helvetica-Bold" : "Helvetica").fontSize(index === 2 ? 11 : 9).fillColor("#111114");
      doc.text(row[0], 340, y, { width: 80 });
      doc.text(row[1], 450, y, { width: 97, align: "right" });
      y += index === 2 ? 20 : 16;
    });
    if (input.note) {
      y += 8;
      doc.font("Helvetica").fontSize(9).fillColor("#3f3f46").text(input.note, 48, y, { width: 500 });
      y = doc.y + 12;
    }
    if (input.bank && (input.bank.iban || input.bank.bank)) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111114").text(input.locale === "de" ? "Zahlung" : "Payment", 48, y);
      y += 14;
      doc.font("Helvetica").fontSize(9).fillColor("#3f3f46");
      const bankLines = [input.bank.holder, input.bank.bank, input.bank.iban ? `IBAN ${input.bank.iban}` : "", input.bank.bic ? `BIC ${input.bank.bic}` : ""].filter(Boolean);
      for (const line of bankLines) {
        doc.text(line, 48, y, { width: 300 });
        y = doc.y;
      }
    }
    doc.font("Helvetica").fontSize(8).fillColor("#71717a").text(input.footer, 48, 780, { width: 500, align: "center" });
  });
}
