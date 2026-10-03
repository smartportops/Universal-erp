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
import {
  loadPickLists,
  nextListNumber,
  savePickLists,
  uid,
  type OrderFilter,
  type PickList,
  type WmsDataSource,
} from "./source";

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const daysAgo = (days: number, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

type Variant = { variantId: string; productId: string; sku: string; ean: string; name: string; productName: string };

const WAREHOUSE = { id: "wh_main", code: "HL", name: "Hauptlager Hamburg", isDefault: true };

const variants: Variant[] = [
  { variantId: "v1", productId: "p1", sku: "HD-CL-BLK-M", ean: "4012345000011", name: "Hoodie Classic · Schwarz · M", productName: "Hoodie Classic" },
  { variantId: "v2", productId: "p1", sku: "HD-CL-BLK-L", ean: "4012345000028", name: "Hoodie Classic · Schwarz · L", productName: "Hoodie Classic" },
  { variantId: "v3", productId: "p1", sku: "HD-CL-GRY-M", ean: "4012345000035", name: "Hoodie Classic · Grau · M", productName: "Hoodie Classic" },
  { variantId: "v4", productId: "p2", sku: "TS-BASIC-WHT-S", ean: "4012345000042", name: "T-Shirt Basic · Weiß · S", productName: "T-Shirt Basic" },
  { variantId: "v5", productId: "p2", sku: "TS-BASIC-WHT-M", ean: "4012345000059", name: "T-Shirt Basic · Weiß · M", productName: "T-Shirt Basic" },
  { variantId: "v6", productId: "p3", sku: "CAP-LOGO-NVY", ean: "4012345000066", name: "Cap Logo · Navy", productName: "Cap Logo" },
  { variantId: "v7", productId: "p4", sku: "BOT-STEEL-750", ean: "4012345000073", name: "Trinkflasche Steel 750 ml", productName: "Trinkflasche Steel" },
  { variantId: "v8", productId: "p5", sku: "SOCK-3P-42", ean: "4012345000080", name: "Socken 3er-Pack · 42–46", productName: "Socken 3er-Pack" },
  { variantId: "v9", productId: "p6", sku: "BAG-TOTE-NAT", ean: "4012345000097", name: "Tote Bag · Natur", productName: "Tote Bag" },
  { variantId: "v10", productId: "p7", sku: "MUG-ENAMEL-WHT", ean: "4012345000103", name: "Emaille-Becher · Weiß", productName: "Emaille-Becher" },
];

const bins: WmsBin[] = [
  { id: "b_in", warehouseId: WAREHOUSE.id, code: "WE-01", name: "Wareneingang", type: "receiving", active: true, articles: 0, units: 0 },
  { id: "b_a1", warehouseId: WAREHOUSE.id, code: "A-01-01", name: "Regal A · Ebene 1", type: "shelf", active: true, articles: 0, units: 0 },
  { id: "b_a2", warehouseId: WAREHOUSE.id, code: "A-01-02", name: "Regal A · Ebene 2", type: "shelf", active: true, articles: 0, units: 0 },
  { id: "b_a3", warehouseId: WAREHOUSE.id, code: "A-02-01", name: "Regal A · Fach 2", type: "shelf", active: true, articles: 0, units: 0 },
  { id: "b_b1", warehouseId: WAREHOUSE.id, code: "B-01-01", name: "Regal B · Ebene 1", type: "shelf", active: true, articles: 0, units: 0 },
  { id: "b_b2", warehouseId: WAREHOUSE.id, code: "B-01-02", name: "Regal B · Ebene 2", type: "shelf", active: true, articles: 0, units: 0 },
  { id: "b_pal", warehouseId: WAREHOUSE.id, code: "PAL-01", name: "Palettenplatz 1", type: "pallet", active: true, articles: 0, units: 0 },
  { id: "b_ret", warehouseId: WAREHOUSE.id, code: "RET-01", name: "Retourenprüfung", type: "returns", active: true, articles: 0, units: 0 },
  { id: "b_out", warehouseId: WAREHOUSE.id, code: "WA-01", name: "Packplatz", type: "packing", active: true, articles: 0, units: 0 },
];

/** stock per bin: binId -> variantId -> qty */
const stock: Record<string, Record<string, number>> = {
  b_a1: { v1: 24, v2: 18 },
  b_a2: { v3: 12, v4: 40 },
  b_a3: { v5: 36 },
  b_b1: { v6: 15, v7: 22 },
  b_b2: { v8: 60, v9: 31 },
  b_pal: { v10: 120 },
};

const movements: WmsMovement[] = [];

function variant(id: string) {
  const found = variants.find((v) => v.variantId === id);
  if (!found) throw new Error("Unknown article");
  return found;
}

function bin(id: string) {
  const found = bins.find((b) => b.id === id);
  if (!found) throw new Error("Unknown bin");
  return found;
}

function move(binId: string, variantId: string, quantity: number, type: string, reference: string) {
  stock[binId] ??= {};
  const next = (stock[binId][variantId] ?? 0) + quantity;
  if (next < 0) throw new Error("Not enough stock on this bin.");
  stock[binId][variantId] = next;
  if (next === 0) delete stock[binId][variantId];
  const v = variant(variantId);
  movements.unshift({ id: uid(), at: new Date().toISOString(), sku: v.sku, name: v.name, binCode: bin(binId).code, quantity, type, reference });
}

function binsFor(variantId: string) {
  return Object.entries(stock)
    .filter(([, items]) => (items[variantId] ?? 0) > 0)
    .map(([binId, items]) => ({ binId, binCode: bin(binId).code, quantity: items[variantId] }));
}

function onHand(variantId: string) {
  return binsFor(variantId).reduce((acc, row) => acc + row.quantity, 0);
}

const purchaseOrders: WmsPurchaseOrder[] = [
  {
    id: "po1",
    number: "PO-2026-0041",
    status: "ordered",
    supplier: { id: "s1", name: "Nordtextil GmbH" },
    warehouseId: WAREHOUSE.id,
    orderedAt: daysAgo(6),
    expectedAt: daysAgo(-1),
    reference: "NT-88213",
    lines: [
      { id: "pol1", variantId: "v1", sku: "HD-CL-BLK-M", ean: "4012345000011", name: "Hoodie Classic · Schwarz · M", ordered: 50, received: 0 },
      { id: "pol2", variantId: "v2", sku: "HD-CL-BLK-L", ean: "4012345000028", name: "Hoodie Classic · Schwarz · L", ordered: 50, received: 0 },
      { id: "pol3", variantId: "v3", sku: "HD-CL-GRY-M", ean: "4012345000035", name: "Hoodie Classic · Grau · M", ordered: 30, received: 0 },
    ],
  },
  {
    id: "po2",
    number: "PO-2026-0042",
    status: "partial",
    supplier: { id: "s2", name: "Steelware Trading" },
    warehouseId: WAREHOUSE.id,
    orderedAt: daysAgo(9),
    expectedAt: daysAgo(0),
    reference: "SW-5512",
    lines: [
      { id: "pol4", variantId: "v7", sku: "BOT-STEEL-750", ean: "4012345000073", name: "Trinkflasche Steel 750 ml", ordered: 120, received: 60 },
      { id: "pol5", variantId: "v10", sku: "MUG-ENAMEL-WHT", ean: "4012345000103", name: "Emaille-Becher · Weiß", ordered: 200, received: 0 },
    ],
  },
  {
    id: "po3",
    number: "PO-2026-0043",
    status: "ordered",
    supplier: { id: "s3", name: "Cotton & Co." },
    warehouseId: WAREHOUSE.id,
    orderedAt: daysAgo(2),
    expectedAt: daysAgo(-4),
    reference: "",
    lines: [
      { id: "pol6", variantId: "v4", sku: "TS-BASIC-WHT-S", ean: "4012345000042", name: "T-Shirt Basic · Weiß · S", ordered: 80, received: 0 },
      { id: "pol7", variantId: "v5", sku: "TS-BASIC-WHT-M", ean: "4012345000059", name: "T-Shirt Basic · Weiß · M", ordered: 80, received: 0 },
      { id: "pol8", variantId: "v8", sku: "SOCK-3P-42", ean: "4012345000080", name: "Socken 3er-Pack · 42–46", ordered: 100, received: 0 },
    ],
  },
];

function line(id: string, variantId: string, quantity: number, shipped = 0) {
  const v = variant(variantId);
  return { id, variantId, sku: v.sku, ean: v.ean, name: v.name, quantity, shipped, bins: binsFor(variantId) };
}

const orders: WmsOrder[] = [
  { id: "o1", number: "SO-10231", channel: "shop", status: "confirmed", priority: "normal", onHold: false, placedAt: daysAgo(0, 8), warehouseId: WAREHOUSE.id, customer: { id: "c1", name: "Lena Hoffmann", company: "", type: "b2c" }, shipTo: { city: "Berlin", country: "DE" }, lines: [line("ol1", "v1", 1), line("ol2", "v8", 2)], shipments: [] },
  { id: "o2", number: "SO-10232", channel: "shop", status: "confirmed", priority: "high", onHold: false, placedAt: daysAgo(0, 9), warehouseId: WAREHOUSE.id, customer: { id: "c2", name: "Jonas Weber", company: "", type: "b2c" }, shipTo: { city: "München", country: "DE" }, lines: [line("ol3", "v6", 1)], shipments: [] },
  { id: "o3", number: "SO-10233", channel: "amazon", status: "confirmed", priority: "normal", onHold: false, placedAt: daysAgo(0, 9), warehouseId: WAREHOUSE.id, customer: { id: "c3", name: "Amazon Kunde", company: "", type: "b2c" }, shipTo: { city: "Wien", country: "AT" }, lines: [line("ol4", "v7", 2), line("ol5", "v10", 2)], shipments: [] },
  { id: "o4", number: "SO-10234", channel: "shop", status: "confirmed", priority: "normal", onHold: false, placedAt: daysAgo(0, 10), warehouseId: WAREHOUSE.id, customer: { id: "c4", name: "Sarah Klein", company: "", type: "b2c" }, shipTo: { city: "Köln", country: "DE" }, lines: [line("ol6", "v4", 3)], shipments: [] },
  { id: "o5", number: "SO-10235", channel: "b2b", status: "confirmed", priority: "normal", onHold: false, placedAt: daysAgo(1, 14), warehouseId: WAREHOUSE.id, customer: { id: "c5", name: "Einkauf", company: "Concept Store Hafen GmbH", type: "b2b" }, shipTo: { city: "Hamburg", country: "DE" }, lines: [line("ol7", "v2", 10), line("ol8", "v3", 6), line("ol9", "v9", 20)], shipments: [] },
  { id: "o6", number: "SO-10236", channel: "shop", status: "confirmed", priority: "normal", onHold: true, placedAt: daysAgo(1, 16), warehouseId: WAREHOUSE.id, customer: { id: "c6", name: "Tim Berger", company: "", type: "b2c" }, shipTo: { city: "Zürich", country: "CH" }, lines: [line("ol10", "v5", 1)], shipments: [] },
  { id: "o7", number: "SO-10237", channel: "ebay", status: "confirmed", priority: "normal", onHold: false, placedAt: daysAgo(0, 11), warehouseId: WAREHOUSE.id, customer: { id: "c7", name: "Mara Fuchs", company: "", type: "b2c" }, shipTo: { city: "Leipzig", country: "DE" }, lines: [line("ol11", "v9", 1), line("ol12", "v10", 1)], shipments: [] },
  { id: "o8", number: "SO-10238", channel: "shop", status: "confirmed", priority: "normal", onHold: false, placedAt: daysAgo(0, 12), warehouseId: WAREHOUSE.id, customer: { id: "c8", name: "Paul Richter", company: "", type: "b2c" }, shipTo: { city: "Dresden", country: "DE" }, lines: [line("ol13", "v1", 1)], shipments: [] },
  { id: "o9", number: "SO-10212", channel: "shop", status: "shipped", priority: "normal", onHold: false, placedAt: daysAgo(5), warehouseId: WAREHOUSE.id, customer: { id: "c9", name: "Anna Schulz", company: "", type: "b2c" }, shipTo: { city: "Frankfurt", country: "DE" }, lines: [line("ol14", "v3", 1, 1), line("ol15", "v6", 1, 1)], shipments: [{ id: "sh1", number: "SH-00412", carrier: "DHL", trackingNumber: "00340434161234567890", shippedAt: daysAgo(4) }] },
  { id: "o10", number: "SO-10215", channel: "amazon", status: "delivered", priority: "normal", onHold: false, placedAt: daysAgo(8), warehouseId: WAREHOUSE.id, customer: { id: "c10", name: "Felix Braun", company: "", type: "b2c" }, shipTo: { city: "Stuttgart", country: "DE" }, lines: [line("ol16", "v7", 1, 1)], shipments: [{ id: "sh2", number: "SH-00401", carrier: "DPD", trackingNumber: "01445883920011", shippedAt: daysAgo(7) }] },
  { id: "o11", number: "SO-10219", channel: "shop", status: "shipped", priority: "normal", onHold: false, placedAt: daysAgo(3), warehouseId: WAREHOUSE.id, customer: { id: "c11", name: "Nina Vogel", company: "", type: "b2c" }, shipTo: { city: "Bremen", country: "DE" }, lines: [line("ol17", "v4", 2, 2), line("ol18", "v8", 1, 1)], shipments: [{ id: "sh3", number: "SH-00418", carrier: "DHL", trackingNumber: "00340434169876543210", shippedAt: daysAgo(2) }] },
];

const profiles: WmsPickProfile[] = [
  { id: "pp1", name: "Shop · Einzelpositionen", channel: "shop", customerType: null, maxOrders: 20, carrier: "DHL", maxLines: 1 },
  { id: "pp2", name: "Shop · Mehrpositionen", channel: "shop", customerType: null, maxOrders: 10, carrier: "DHL", maxLines: 0 },
  { id: "pp3", name: "Marktplätze", channel: null, customerType: "b2c", maxOrders: 15, carrier: "DPD", maxLines: 0 },
  { id: "pp4", name: "B2B / Großkunden", channel: null, customerType: "b2b", maxOrders: 3, carrier: "Spedition", maxLines: 0 },
];

let shipmentCounter = 419;
let returnCounter = 31;

function refreshBins(list: WmsOrder[]) {
  for (const order of list) for (const l of order.lines) l.bins = binsFor(l.variantId);
}

function matches(order: WmsOrder, filter: OrderFilter) {
  const q = (filter.q ?? "").trim().toLowerCase();
  if (filter.number && !order.number.toLowerCase().includes(filter.number.toLowerCase())) return false;
  if (filter.customer && !`${order.customer.name} ${order.customer.company}`.toLowerCase().includes(filter.customer.toLowerCase())) return false;
  if (filter.tracking && !order.shipments.some((s) => s.trackingNumber.includes(filter.tracking!) || s.number.toLowerCase().includes(filter.tracking!.toLowerCase()))) return false;
  if (q) {
    const hay = [order.number, order.customer.name, order.customer.company, ...order.shipments.map((s) => s.trackingNumber), ...order.lines.map((l) => l.sku)].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (filter.status === "shipped") return ["shipped", "delivered", "partial"].includes(order.status) && order.shipments.length > 0;
  if (filter.status === "open") return ["confirmed", "picking", "partial"].includes(order.status);
  return true;
}

export class DemoSource implements WmsDataSource {
  readonly kind = "demo" as const;
  private scope = "demo";

  async handshake(): Promise<WmsHandshake> {
    await delay();
    return { organization: { id: "demo", name: "Heller Living (Demo)" }, warehouses: [WAREHOUSE], serverTime: new Date().toISOString(), apiVersion: 1 };
  }

  async dashboard(): Promise<WmsDashboard> {
    await delay();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      const base = [42, 61, 55, 78, 67, 23, 0][index];
      const dyn = movements.filter((m) => m.at.slice(0, 10) === key);
      return {
        date: key,
        shipped: base + dyn.filter((m) => m.type === "shipment").reduce((a, m) => a - m.quantity, 0),
        received: [120, 0, 60, 0, 200, 0, 0][index] + dyn.filter((m) => m.type === "receipt").reduce((a, m) => a + m.quantity, 0),
      };
    });
    return {
      openPurchaseOrders: purchaseOrders.filter((po) => po.status !== "received").length,
      openOrders: orders.filter((o) => ["confirmed", "picking", "partial"].includes(o.status) && !o.onHold).length,
      onHoldOrders: orders.filter((o) => o.onHold).length,
      shipped7d: days.reduce((a, d) => a + d.shipped, 0),
      received7d: days.reduce((a, d) => a + d.received, 0),
      returns7d: 6 + (returnCounter - 31),
      lowStock: variants.filter((v) => onHand(v.variantId) < 15).length,
      days,
    };
  }

  async purchaseOrders() {
    await delay();
    return purchaseOrders.filter((po) => po.status !== "received" && po.status !== "cancelled").map((po) => ({ ...po, lines: po.lines.map((l) => ({ ...l })) }));
  }

  async receive(input: WmsReceiveInput) {
    await delay();
    const po = purchaseOrders.find((p) => p.id === input.purchaseOrderId);
    if (!po) throw new Error("Purchase order not found.");
    let any = false;
    for (const l of po.lines) {
      const outstanding = l.ordered - l.received;
      const qty = input.quantities ? Math.min(input.quantities[l.variantId] ?? 0, outstanding) : outstanding;
      if (qty <= 0) continue;
      any = true;
      l.received += qty;
      move("b_in", l.variantId, qty, "receipt", po.number);
    }
    if (!any) throw new Error("Nothing to receive.");
    po.status = po.lines.every((l) => l.received >= l.ordered) ? "received" : "partial";
    refreshBins(orders);
  }

  async openOrders() {
    await delay();
    refreshBins(orders);
    return orders.filter((o) => matches(o, { status: "open" })).map(clone);
  }

  async orders(filter: OrderFilter) {
    await delay();
    refreshBins(orders);
    return orders.filter((o) => matches(o, filter)).map(clone);
  }

  async startPicking(orderId: string) {
    const order = orders.find((o) => o.id === orderId);
    if (order && order.status === "confirmed") order.status = "picking";
  }

  async ship(input: WmsShipInput) {
    await delay();
    const order = orders.find((o) => o.id === input.orderId);
    if (!order) throw new Error("Order not found.");
    if (order.onHold) throw new Error("This order is on hold.");
    const number = `SH-${String(++shipmentCounter).padStart(5, "0")}`;
    let shippedAny = false;
    for (const l of order.lines) {
      const remaining = l.quantity - l.shipped;
      const qty = input.quantities ? Math.min(input.quantities[l.variantId] ?? 0, remaining) : remaining;
      if (qty <= 0) continue;
      shippedAny = true;
      let left = qty;
      for (const row of binsFor(l.variantId)) {
        if (left <= 0) break;
        const take = Math.min(left, row.quantity);
        move(row.binId, l.variantId, -take, "shipment", number);
        left -= take;
      }
      l.shipped += qty;
    }
    if (!shippedAny) throw new Error("Nothing left to ship.");
    order.shipments.push({ id: uid(), number, carrier: input.carrier, trackingNumber: input.trackingNumber ?? "", shippedAt: new Date().toISOString() });
    order.status = order.lines.every((l) => l.shipped >= l.quantity) ? "shipped" : "partial";
    refreshBins(orders);
    return { shipmentNumber: number };
  }

  async createReturn(input: WmsReturnInput) {
    await delay();
    const order = orders.find((o) => o.id === input.orderId);
    if (!order) throw new Error("Order not found.");
    const number = `RT-${String(++returnCounter).padStart(4, "0")}`;
    for (const l of input.lines) {
      if (l.quantity <= 0) continue;
      move(l.disposition === "restock" ? "b_ret" : "b_ret", l.variantId, l.quantity, "return", number);
    }
    return { returnNumber: number };
  }

  async pickProfiles() {
    await delay(40);
    return profiles.map((p) => ({ ...p }));
  }

  async pickLists() {
    return loadPickLists(this.scope);
  }

  async createPickList(profile: WmsPickProfile, orderIds: string[]) {
    const lists = loadPickLists(this.scope);
    const list: PickList = {
      id: uid(),
      number: nextListNumber(lists),
      profileId: profile.id,
      profileName: profile.name,
      carrier: profile.carrier,
      status: "open",
      createdAt: new Date().toISOString(),
      orderIds,
      picked: {},
      packed: {},
      shippedOrderIds: [],
    };
    savePickLists(this.scope, [list, ...lists]);
    return list;
  }

  async updatePickList(list: PickList) {
    const lists = loadPickLists(this.scope).map((l) => (l.id === list.id ? list : l));
    savePickLists(this.scope, lists);
    return list;
  }

  async deletePickList(id: string) {
    savePickLists(this.scope, loadPickLists(this.scope).filter((l) => l.id !== id));
  }

  async articles(q?: string): Promise<WmsArticle[]> {
    await delay();
    const needle = (q ?? "").trim().toLowerCase();
    return variants
      .filter((v) => !needle || `${v.sku} ${v.ean} ${v.name}`.toLowerCase().includes(needle))
      .map((v) => {
        const incoming = purchaseOrders.flatMap((po) => po.lines).filter((l) => l.variantId === v.variantId).reduce((a, l) => a + (l.ordered - l.received), 0);
        const demand = orders.filter((o) => matches(o, { status: "open" })).flatMap((o) => o.lines).filter((l) => l.variantId === v.variantId).reduce((a, l) => a + (l.quantity - l.shipped), 0);
        return { ...v, onHand: onHand(v.variantId), incoming, openDemand: demand, bins: binsFor(v.variantId) };
      });
  }

  async bins() {
    await delay();
    return bins.map((b) => {
      const items = stock[b.id] ?? {};
      return { ...b, articles: Object.keys(items).length, units: Object.values(items).reduce((a, n) => a + n, 0) };
    });
  }

  async createBin(input: WmsBinInput) {
    await delay();
    if (bins.some((b) => b.code.toLowerCase() === input.code.toLowerCase())) throw new Error("A bin with this code already exists.");
    const created: WmsBin = { id: uid(), warehouseId: input.warehouseId || WAREHOUSE.id, code: input.code, name: input.name, type: input.type, active: true, articles: 0, units: 0 };
    bins.push(created);
    return created;
  }

  async transfer(input: WmsTransferInput) {
    await delay();
    if (input.fromBinId === input.toBinId) throw new Error("Source and target bin are the same.");
    move(input.fromBinId, input.variantId, -input.quantity, "transfer_out", `${bin(input.fromBinId).code} → ${bin(input.toBinId).code}`);
    move(input.toBinId, input.variantId, input.quantity, "transfer_in", `${bin(input.fromBinId).code} → ${bin(input.toBinId).code}`);
    refreshBins(orders);
  }

  async adjust(input: WmsAdjustInput) {
    await delay();
    if (input.quantity === 0) throw new Error("Quantity must not be zero.");
    move(input.binId, input.variantId, input.quantity, "adjustment", input.reason);
    refreshBins(orders);
  }

  async movements(limit = 50) {
    return movements.slice(0, limit);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
