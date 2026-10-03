import type {
  WmsAdjustInput,
  WmsArticle,
  WmsBin,
  WmsBinInput,
  WmsDashboard,
  WmsHandshake,
  WmsMovement,
  WmsOrder,
  WmsPickProfile,
  WmsPurchaseOrder,
  WmsReceiveInput,
  WmsReturnInput,
  WmsShipInput,
  WmsTransferInput,
} from "@shared/api";

/** A pick list groups orders for one picking run. Lists live in the client for now (see README). */
export type PickList = {
  id: string;
  number: string;
  profileId: string;
  profileName: string;
  carrier: string;
  status: "open" | "picking" | "picked" | "shipped";
  createdAt: string;
  orderIds: string[];
  /** variantId -> picked quantity */
  picked: Record<string, number>;
  /** orderId -> variantId -> packed quantity (Fast Ship progress) */
  packed: Record<string, Record<string, number>>;
  shippedOrderIds: string[];
};

export type OrderFilter = { q?: string; number?: string; customer?: string; tracking?: string; status?: "shipped" | "open" };

/**
 * Everything the UI needs from the outside world. Two implementations exist:
 * `DemoSource` (in-memory, ships with the app) and `HttpSource` (Aera ERP).
 * Modules never touch fetch/localStorage directly – they only call this.
 */
export interface WmsDataSource {
  readonly kind: "demo" | "http";
  handshake(): Promise<WmsHandshake>;
  dashboard(): Promise<WmsDashboard>;

  purchaseOrders(): Promise<WmsPurchaseOrder[]>;
  receive(input: WmsReceiveInput): Promise<void>;

  openOrders(): Promise<WmsOrder[]>;
  orders(filter: OrderFilter): Promise<WmsOrder[]>;
  startPicking(orderId: string): Promise<void>;
  ship(input: WmsShipInput): Promise<{ shipmentNumber: string }>;
  createReturn(input: WmsReturnInput): Promise<{ returnNumber: string }>;

  pickProfiles(): Promise<WmsPickProfile[]>;
  pickLists(): Promise<PickList[]>;
  createPickList(profile: WmsPickProfile, orderIds: string[]): Promise<PickList>;
  updatePickList(list: PickList): Promise<PickList>;
  deletePickList(id: string): Promise<void>;

  articles(q?: string): Promise<WmsArticle[]>;
  bins(): Promise<WmsBin[]>;
  createBin(input: WmsBinInput): Promise<WmsBin>;
  transfer(input: WmsTransferInput): Promise<void>;
  adjust(input: WmsAdjustInput): Promise<void>;
  movements(limit?: number): Promise<WmsMovement[]>;
}

/* ---- helpers shared by both sources ----------------------------------- */

const LISTS_KEY = "aera_wms_picklists";

export function loadPickLists(scope: string): PickList[] {
  try {
    const raw = localStorage.getItem(`${LISTS_KEY}:${scope}`);
    return raw ? (JSON.parse(raw) as PickList[]) : [];
  } catch {
    return [];
  }
}

export function savePickLists(scope: string, lists: PickList[]) {
  localStorage.setItem(`${LISTS_KEY}:${scope}`, JSON.stringify(lists));
}

export function nextListNumber(lists: PickList[]) {
  const max = lists.reduce((acc, list) => Math.max(acc, Number(list.number.replace(/\D/g, "")) || 0), 0);
  return `PL-${String(max + 1).padStart(4, "0")}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Orders that match a pick profile and are not yet on another list. */
export function eligibleOrders(orders: WmsOrder[], profile: WmsPickProfile, lists: PickList[]) {
  const taken = new Set(lists.filter((l) => l.status !== "shipped").flatMap((l) => l.orderIds));
  return orders.filter((order) => {
    if (taken.has(order.id) || order.onHold) return false;
    if (!["confirmed", "picking", "partial"].includes(order.status)) return false;
    if (profile.channel && order.channel !== profile.channel) return false;
    if (profile.customerType && order.customer.type !== profile.customerType) return false;
    if (profile.maxLines > 0 && order.lines.length > profile.maxLines) return false;
    return true;
  });
}
