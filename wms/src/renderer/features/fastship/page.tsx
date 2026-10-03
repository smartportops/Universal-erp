import { useMemo, useState } from "react";
import { PackageCheck, Printer, Truck } from "lucide-react";
import type { WmsOrder } from "@shared/api";
import { Page } from "@/app/shell";
import { useData, useLoad } from "@/data/provider";
import type { PickList } from "@/data/source";
import { cn, sum } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useScanner } from "@/lib/scanner";
import { useSettings } from "@/lib/settings";
import { BigButton, Done, EmptyState, Field, Input, Notice, Panel, Pill, Progress, ScanInput, Select, statusTone, Table, Td, Th } from "@/ui";
import { useToast } from "@/ui/toast";

/**
 * Fast Ship: choose a picked list, scan the first article of a parcel – the
 * WMS finds the order that needs it – keep scanning until the order is
 * complete, then ship. Shipping tells the ERP, which creates the shipment,
 * books the stock movements and marks the order shipped.
 */
export function FastShipPage() {
  const t = useT();
  const source = useData();
  const toast = useToast();
  const settings = useSettings();
  const lists = useLoad(() => source.pickLists(), [source]);
  const orders = useLoad(() => source.openOrders(), [source]);
  const [listId, setListId] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(() => (lists.data ?? []).filter((l) => l.status === "picked" || l.status === "picking"), [lists.data]);
  const list = candidates.find((l) => l.id === listId) ?? null;
  const listOrders = useMemo(
    () => (list && orders.data ? orders.data.filter((o) => list.orderIds.includes(o.id) && !list.shippedOrderIds.includes(o.id)) : []),
    [list, orders.data],
  );
  const active = listOrders.find((o) => o.id === activeOrderId) ?? null;
  const packedFor = (order: WmsOrder) => list?.packed[order.id] ?? {};
  const remaining = (order: WmsOrder) => sum(order.lines.map((l) => l.quantity - l.shipped - (packedFor(order)[l.variantId] ?? 0)));

  const persist = async (next: PickList) => {
    await source.updatePickList(next);
    lists.setData((current) => (current ?? []).map((l) => (l.id === next.id ? next : l)));
  };

  const chooseList = (next: PickList) => {
    setListId(next.id);
    setActiveOrderId(null);
    setCarrier(next.carrier || settings.defaultCarrier);
    setTracking("");
  };

  const scan = (code: string) => {
    if (!list) return;
    const needle = code.toLowerCase();
    const find = (order: WmsOrder) => order.lines.find((l) => (l.sku.toLowerCase() === needle || l.ean === code) && l.quantity - l.shipped - (packedFor(order)[l.variantId] ?? 0) > 0);
    let order = active && find(active) ? active : null;
    if (!order) order = listOrders.find((o) => find(o)) ?? null;
    if (!order) {
      // maybe a tracking number was scanned
      if (active && code.length >= 8 && !/\s/.test(code)) {
        setTracking(code);
        toast.ok(t("Tracking number set"), code);
        return;
      }
      toast.error(t("No open order on this list needs that article"), code);
      return;
    }
    const line = find(order)!;
    const packed = { ...list.packed, [order.id]: { ...packedFor(order), [line.variantId]: (packedFor(order)[line.variantId] ?? 0) + 1 } };
    void persist({ ...list, packed });
    if (order.id !== activeOrderId) {
      setActiveOrderId(order.id);
      setTracking("");
      toast.info(t("Order {n} opened", { n: order.number }));
    }
  };
  useScanner(scan, { suffix: settings.scannerSuffix });

  const ship = async () => {
    if (!list || !active) return;
    setBusy(true);
    try {
      const packed = packedFor(active);
      const quantities = Object.fromEntries(active.lines.map((l) => [l.variantId, packed[l.variantId] ?? 0]));
      const result = await source.ship({ orderId: active.id, carrier: carrier.trim() || settings.defaultCarrier, trackingNumber: tracking.trim() || undefined, quantities });
      const shippedOrderIds = [...list.shippedOrderIds, active.id];
      const allDone = list.orderIds.every((id) => shippedOrderIds.includes(id));
      await persist({ ...list, shippedOrderIds, status: allDone ? "shipped" : list.status });
      toast.ok(t("Shipped"), `${active.number} · ${result.shipmentNumber}`);
      setActiveOrderId(null);
      setTracking("");
      orders.reload();
      if (allDone) {
        setListId(null);
        toast.info(t("Pick list complete"), list.number);
      }
    } catch (err) {
      toast.error(t("Shipping failed"), (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activeRemaining = active ? remaining(active) : 0;

  return (
    <Page title={t("Fast Ship")} subtitle={t("Pack and ship order by order from a pick list")} actions={<BigButton size="md" onClick={() => { lists.reload(); orders.reload(); }}>{t("Refresh")}</BigButton>}>
      {orders.error ? <Notice tone="danger" className="mb-4">{orders.error}</Notice> : null}
      <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)_420px] gap-5">
        <Panel title={t("Pick lists")} description={t("Picked lists ready to pack")} flush>
          {candidates.length === 0 ? <EmptyState icon={PackageCheck} title={t("Nothing to pack")} body={t("Finish a pick run first – picked lists show up here.")} /> : null}
          {candidates.map((entry) => (
            <button key={entry.id} type="button" onClick={() => chooseList(entry)} className={cn("touch-row", entry.id === listId && "bg-accent-soft")}>
              <div className="min-w-0 flex-1 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[15px] font-semibold">{entry.number}</span>
                  <Pill tone={statusTone(entry.status)}>{t(entry.status)}</Pill>
                </div>
                <div className="truncate text-[14px] text-muted">{entry.profileName} · {entry.carrier}</div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-semibold tabular-nums">{entry.orderIds.length - entry.shippedOrderIds.length}</div>
                <div className="text-[11.5px] text-faint">{t("open")}</div>
              </div>
            </button>
          ))}
        </Panel>

        <Panel title={active ? `${active.number} · ${active.customer.company || active.customer.name}` : t("Pack")} description={list ? t("Scan an article – the matching order opens automatically") : t("Choose a pick list on the left")}>
          <ScanInput onScan={scan} disabled={!list} placeholder={t("Scan article (SKU / EAN)")} />
          {active ? (
            <div className="mt-5 space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-[14px]">
                  <span className="font-medium">{t("Packed")}</span>
                  <span className="tabular-nums text-muted">{sum(active.lines.map((l) => l.quantity - l.shipped)) - activeRemaining} / {sum(active.lines.map((l) => l.quantity - l.shipped))}</span>
                </div>
                <Progress value={sum(active.lines.map((l) => l.quantity - l.shipped)) - activeRemaining} max={sum(active.lines.map((l) => l.quantity - l.shipped))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("Carrier")}>
                  <Select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                    {[carrier, "DHL", "DPD", "GLS", "Hermes", "UPS", "FedEx", "Deutsche Post", "Spedition"].filter((v, i, a) => v && a.indexOf(v) === i).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("Tracking number")} hint={t("Scan the label or leave empty")}>
                  <Input value={tracking} onChange={(e) => setTracking(e.target.value)} className="font-mono" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <BigButton size="xl" variant="primary" icon={Truck} disabled={busy || activeRemaining > 0} onClick={ship}>
                  {activeRemaining > 0 ? t("{n} units left", { n: activeRemaining }) : t("Ship order")}
                </BigButton>
                <BigButton size="xl" variant="dark" icon={Truck} disabled={busy || activeRemaining === 0} onClick={ship}>{t("Ship partially")}</BigButton>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <BigButton icon={Printer} disabled>{t("Print delivery note")}</BigButton>
                <BigButton icon={Printer} disabled>{t("Print shipping label")}</BigButton>
              </div>
            </div>
          ) : list ? (
            <div className="mt-5">
              <Notice tone="neutral">{t("Scan the first article of the parcel in front of you. Fast Ship picks the order that needs it.")}</Notice>
            </div>
          ) : (
            <EmptyState icon={PackageCheck} title={t("No pick list selected")} />
          )}
        </Panel>

        <Panel title={active ? t("Positions") : t("Orders on list")} description={active ? `${active.shipTo.city}, ${active.shipTo.country} · ${active.channel}` : list ? t("{n} open", { n: listOrders.length }) : undefined} flush>
          {active ? (
            <Table>
              <thead>
                <tr>
                  <Th>{t("Article")}</Th>
                  <Th align="right">{t("Qty")}</Th>
                  <Th align="right">{t("Packed")}</Th>
                </tr>
              </thead>
              <tbody>
                {active.lines.map((line) => {
                  const open = line.quantity - line.shipped;
                  const packed = packedFor(active)[line.variantId] ?? 0;
                  return (
                    <tr key={line.id} className={cn(packed >= open && "bg-accent-soft/50")}>
                      <Td>
                        <div className="font-medium leading-tight">{line.name}</div>
                        <div className="font-mono text-[12.5px] text-muted">{line.sku}</div>
                      </Td>
                      <Td align="right" mono>{open}</Td>
                      <Td align="right">{packed >= open ? <Done /> : <span className="font-mono text-[15px]">{packed}</span>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : list ? (
            listOrders.map((order) => (
              <button key={order.id} type="button" onClick={() => setActiveOrderId(order.id)} className="touch-row">
                <div className="min-w-0 flex-1 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{order.number}</span>
                    {order.priority === "high" ? <Pill tone="danger">{t("Priority")}</Pill> : null}
                  </div>
                  <div className="truncate text-[14px] text-muted">{order.customer.company || order.customer.name} · {order.shipTo.city}</div>
                </div>
                <div className="text-right text-[14px] tabular-nums text-muted">{remaining(order)} {t("units")}</div>
              </button>
            ))
          ) : (
            <EmptyState title={t("Orders appear here")} />
          )}
          {active ? (
            <div className="p-4">
              <BigButton block variant="ghost" onClick={() => setActiveOrderId(null)}>{t("Back to order list")}</BigButton>
            </div>
          ) : null}
        </Panel>
      </div>
    </Page>
  );
}
