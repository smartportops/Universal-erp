export type Tone = "neutral" | "ok" | "warning" | "danger" | "info";

export function tone(map: Record<string, { label: string; tone: Tone }>, key: string) {
  return map[key] ?? { label: key, tone: "neutral" as Tone };
}

export const orderStatus = {
  draft: { label: "Draft", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "info" },
  picking: { label: "Picking", tone: "warning" },
  partial: { label: "Partially shipped", tone: "warning" },
  shipped: { label: "Shipped", tone: "ok" },
  delivered: { label: "Delivered", tone: "ok" },
  completed: { label: "Completed", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "neutral" },
} satisfies Record<string, { label: string; tone: Tone }>;

export const purchaseStatus = {
  draft: { label: "Draft", tone: "neutral" },
  ordered: { label: "Ordered", tone: "info" },
  partial: { label: "Partially received", tone: "warning" },
  received: { label: "Received", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "neutral" },
} satisfies Record<string, { label: string; tone: Tone }>;

export const shipmentStatus = {
  shipped: { label: "In transit", tone: "info" },
  delivered: { label: "Delivered", tone: "ok" },
  exception: { label: "Exception", tone: "danger" },
} satisfies Record<string, { label: string; tone: Tone }>;

export const returnStatus = {
  requested: { label: "Requested", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  received: { label: "Received", tone: "ok" },
  refunded: { label: "Refunded", tone: "ok" },
  rejected: { label: "Rejected", tone: "neutral" },
} satisfies Record<string, { label: string; tone: Tone }>;

export const invoiceStatus = {
  draft: { label: "Draft", tone: "neutral" },
  issued: { label: "Open", tone: "warning" },
  partial: { label: "Partially paid", tone: "info" },
  paid: { label: "Paid", tone: "ok" },
  void: { label: "Voided", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
} satisfies Record<string, { label: string; tone: Tone }>;

export const productStatus = {
  active: { label: "Active", tone: "ok" },
  draft: { label: "Draft", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
} satisfies Record<string, { label: string; tone: Tone }>;

export const channels: Record<string, string> = {
  shop: "Own shop",
  amazon: "Amazon",
  ebay: "eBay",
  wholesale: "Wholesale",
  manual: "Manual",
};

export const customerTypes: Record<string, string> = {
  b2c: "Consumer",
  b2b: "Business",
};

export const warehouseTypes: Record<string, string> = {
  own: "Own warehouse",
  "3pl": "3PL",
};

export const locationTypes: Record<string, string> = {
  pick: "Picking",
  bulk: "Bulk",
  receiving: "Receiving",
  returns: "Returns",
  quarantine: "Quarantine",
};

export const movementTypes: Record<string, string> = {
  receipt: "Goods receipt",
  shipment: "Goods issue",
  return_in: "Return received",
  adjustment: "Adjustment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

export const dispositions: Record<string, string> = {
  restock: "Restock",
  scrap: "Scrap",
  quarantine: "Hold",
};

export const paymentMethods: Record<string, string> = {
  bank: "Bank transfer",
  card: "Card",
  mollie: "Mollie",
  paypal: "PayPal",
  manual: "Manual",
};

export const accountTypes: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

export const invoiceKinds: Record<string, string> = {
  invoice: "Invoice",
  cancellation: "Cancellation invoice",
  credit: "Credit note",
  credit_cancellation: "Cancellation of credit note",
};

export const priorities: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const documentKinds: Record<string, string> = {
  goods_receipt: "Goods receipt",
  delivery_note: "Delivery note",
  invoice: "Invoice",
  cancellation: "Cancellation invoice",
  credit: "Credit note",
  credit_cancellation: "Cancellation of credit note",
  quote: "Quote",
  purchase_order: "Purchase order",
  other: "Document",
  incoming: "Incoming voucher",
  outgoing: "Outgoing voucher",
};

export const accountNames: Record<string, string> = {
  "0900": "Equity",
  "1200": "Bank",
  "1400": "Receivables",
  "1570": "Input VAT",
  "1600": "Merchandise",
  "3300": "Payables",
  "3800": "Output VAT",
  "4000": "Sales revenue",
  "4200": "Sales revenue, reduced rate",
  "4300": "Sales revenue, zero rate",
  "5000": "Cost of goods",
  "6000": "Rent and premises",
  "6300": "Insurance",
  "6800": "Postage and telecom",
  "6815": "Office supplies",
  "7000": "External services",
};
