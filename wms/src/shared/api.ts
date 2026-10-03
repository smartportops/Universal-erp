/**
 * Wire contract between the Aera ERP (`/api/wms/*`) and the WMS client.
 * The ERP imports this file as well, so both sides always agree on the shape.
 * Keep it JSON-only: no Dates, no classes.
 */

export type WmsWarehouse = { id: string; code: string; name: string; isDefault: boolean };

export type WmsHandshake = {
  organization: { id: string; name: string };
  warehouses: WmsWarehouse[];
  serverTime: string;
  apiVersion: 1;
};

export type WmsBin = {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
  /** distinct articles on the bin */
  articles: number;
  /** summed units on the bin */
  units: number;
};

export type WmsBinStock = { binId: string; binCode: string; quantity: number };

export type WmsArticle = {
  variantId: string;
  productId: string;
  sku: string;
  ean: string;
  name: string;
  productName: string;
  onHand: number;
  incoming: number;
  openDemand: number;
  bins: WmsBinStock[];
};

export type WmsPurchaseOrderLine = {
  id: string;
  variantId: string;
  sku: string;
  ean: string;
  name: string;
  ordered: number;
  received: number;
};

export type WmsPurchaseOrder = {
  id: string;
  number: string;
  status: string;
  supplier: { id: string; name: string };
  warehouseId: string;
  orderedAt: string;
  expectedAt: string | null;
  reference: string;
  lines: WmsPurchaseOrderLine[];
};

export type WmsOrderLine = {
  id: string;
  variantId: string;
  sku: string;
  ean: string;
  name: string;
  quantity: number;
  shipped: number;
  bins: WmsBinStock[];
};

export type WmsOrder = {
  id: string;
  number: string;
  channel: string;
  status: string;
  priority: string;
  onHold: boolean;
  placedAt: string;
  warehouseId: string;
  customer: { id: string; name: string; company: string; type: string };
  shipTo: { city: string; country: string };
  lines: WmsOrderLine[];
  shipments: { id: string; number: string; carrier: string; trackingNumber: string; shippedAt: string | null }[];
};

export type WmsPickProfile = {
  id: string;
  name: string;
  /** restrict to a sales channel, null = any */
  channel: string | null;
  /** restrict to b2b/b2c customers, null = any */
  customerType: string | null;
  maxOrders: number;
  carrier: string;
  /** only orders with at most this many lines (0 = any) */
  maxLines: number;
};

export type WmsDashboard = {
  openPurchaseOrders: number;
  openOrders: number;
  onHoldOrders: number;
  shipped7d: number;
  received7d: number;
  returns7d: number;
  lowStock: number;
  days: { date: string; shipped: number; received: number }[];
};

export type WmsMovement = {
  id: string;
  at: string;
  sku: string;
  name: string;
  binCode: string;
  quantity: number;
  type: string;
  reference: string;
};

/* ---- mutations --------------------------------------------------------- */

export type WmsReceiveInput = {
  purchaseOrderId: string;
  /** optional partial receipt; omitted = receive everything outstanding */
  quantities?: Record<string, number>;
};

export type WmsShipInput = {
  orderId: string;
  carrier: string;
  trackingNumber?: string;
  /** variantId -> quantity; omitted = ship everything outstanding */
  quantities?: Record<string, number>;
};

export type WmsReturnInput = {
  orderId: string;
  reason: string;
  lines: { variantId: string; quantity: number; disposition: "restock" | "inspect" | "scrap" }[];
};

export type WmsTransferInput = { variantId: string; fromBinId: string; toBinId: string; quantity: number };

export type WmsAdjustInput = { variantId: string; binId: string; quantity: number; reason: string };

export type WmsBinInput = { warehouseId: string; code: string; name: string; type: string };

export type WmsOk<T = Record<string, never>> = { ok: true } & T;
export type WmsError = { ok?: false; error: string };
