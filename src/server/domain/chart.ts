/** Compact chart every company starts with. Codes stay stable because invoices post to them. */
export const chartAccounts: { code: string; name: string; type: string }[] = [
  { code: "0900", name: "Eigenkapital", type: "equity" },
  { code: "1200", name: "Bank", type: "asset" },
  { code: "1400", name: "Forderungen", type: "asset" },
  { code: "1570", name: "Vorsteuer", type: "asset" },
  { code: "1600", name: "Warenbestand", type: "asset" },
  { code: "3300", name: "Verbindlichkeiten", type: "liability" },
  { code: "3800", name: "Umsatzsteuer", type: "liability" },
  { code: "4000", name: "Umsatzerlöse", type: "revenue" },
  { code: "4200", name: "Erlöse ermäßigt", type: "revenue" },
  { code: "4300", name: "Steuerfreie Erlöse", type: "revenue" },
  { code: "5000", name: "Wareneinsatz", type: "expense" },
  { code: "6000", name: "Raumkosten", type: "expense" },
  { code: "6300", name: "Versicherungen", type: "expense" },
  { code: "6800", name: "Porto und Telekommunikation", type: "expense" },
  { code: "6815", name: "Bürobedarf", type: "expense" },
  { code: "7000", name: "Fremdleistungen", type: "expense" },
];

/** Accounts added for companies that already had the first chart. */
export const chartAdditions = ["0900", "1570", "4200", "4300", "6000", "6300", "6800", "6815", "7000"];
