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

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Talks to the Aera ERP. Every call goes to `${serverUrl}/api/wms/...` with the
 * organisation's API key. Pick lists are kept client-side until the ERP grows
 * a pick-list model – the interface already allows moving them server-side.
 */
export class HttpSource implements WmsDataSource {
  readonly kind = "http" as const;
  private scope: string;

  constructor(private serverUrl: string, private apiKey: string, private warehouseId: string) {
    this.scope = serverUrl.replace(/[^a-z0-9]/gi, "").slice(-40) || "server";
  }

  private async call<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string | undefined> }): Promise<T> {
    const base = this.serverUrl.replace(/\/+$/, "");
    const url = new URL(`${base}/api/wms${path}`);
    if (this.warehouseId) url.searchParams.set("warehouse", this.warehouseId);
    for (const [key, value] of Object.entries(init?.query ?? {})) if (value) url.searchParams.set(key, value);
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", accept: "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message = (payload as { error?: string } | null)?.error ?? `${response.status} ${response.statusText}`;
      throw new HttpError(message, response.status);
    }
    return payload as T;
  }

  handshake() {
    return this.call<WmsHandshake>("/handshake");
  }

  dashboard() {
    return this.call<WmsDashboard>("/dashboard");
  }

  async purchaseOrders() {
    return (await this.call<{ purchaseOrders: WmsPurchaseOrder[] }>("/purchase-orders")).purchaseOrders;
  }

  async receive(input: WmsReceiveInput) {
    await this.call(`/purchase-orders/${input.purchaseOrderId}/receive`, { method: "POST", body: { quantities: input.quantities } });
  }

  async openOrders() {
    return (await this.call<{ orders: WmsOrder[] }>("/orders", { query: { status: "open" } })).orders;
  }

  async orders(filter: OrderFilter) {
    return (await this.call<{ orders: WmsOrder[] }>("/orders", { query: { ...filter } })).orders;
  }

  async startPicking(orderId: string) {
    await this.call(`/orders/${orderId}/picking`, { method: "POST" });
  }

  ship(input: WmsShipInput) {
    return this.call<{ shipmentNumber: string }>(`/orders/${input.orderId}/ship`, {
      method: "POST",
      body: { carrier: input.carrier, trackingNumber: input.trackingNumber, quantities: input.quantities },
    });
  }

  createReturn(input: WmsReturnInput) {
    return this.call<{ returnNumber: string }>(`/returns`, { method: "POST", body: input });
  }

  async pickProfiles() {
    return (await this.call<{ profiles: WmsPickProfile[] }>("/pick-profiles")).profiles;
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
    savePickLists(this.scope, loadPickLists(this.scope).map((l) => (l.id === list.id ? list : l)));
    return list;
  }

  async deletePickList(id: string) {
    savePickLists(this.scope, loadPickLists(this.scope).filter((l) => l.id !== id));
  }

  async articles(q?: string) {
    return (await this.call<{ articles: WmsArticle[] }>("/articles", { query: { q } })).articles;
  }

  async bins() {
    return (await this.call<{ bins: WmsBin[] }>("/bins")).bins;
  }

  async createBin(input: WmsBinInput) {
    return (await this.call<{ bin: WmsBin }>("/bins", { method: "POST", body: input })).bin;
  }

  async transfer(input: WmsTransferInput) {
    await this.call("/stock/transfer", { method: "POST", body: input });
  }

  async adjust(input: WmsAdjustInput) {
    await this.call("/stock/adjust", { method: "POST", body: input });
  }

  async movements(limit = 50) {
    return (await this.call<{ movements: WmsMovement[] }>("/movements", { query: { limit: String(limit) } })).movements;
  }
}
