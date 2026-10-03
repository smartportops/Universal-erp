import { useMemo, useState } from "react";
import { ArrowDownToLine, PackageOpen, Printer, Truck } from "lucide-react";
import type { WmsPurchaseOrder } from "@shared/api";
import { Page } from "@/app/shell";
import { useData, useLoad } from "@/data/provider";
import { cn, formatDay, sum } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useScanner } from "@/lib/scanner";
import { useSettings } from "@/lib/settings";
import { BigButton, Done, EmptyState, Input, Notice, Panel, Pill, Progress, QtyStepper, ScanInput, statusTone, Table, Td, Th } from "@/ui";
import { useToast } from "@/ui/toast";

/**
 * Goods receipt: pick an open purchase order, scan the delivered units
 * (or type quantities), then book the receipt into the ERP. The ERP writes
 * the stock movements and marks the purchase order received/partial.
 */
export function ReceivingPage() {
  const t = useT();
  const source = useData();
  const toast = useToast();
  const { language, scannerSuffix } = useSettings();
  const { data: orders, loading, error, reload } = useLoad(() => source.purchaseOrders(), [source]);
  const [filter, setFilter] = useState({ number: "", supplier: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [captured, setCaptured] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () =>
      (orders ?? []).filter(
        (po) =>
          po.number.toLowerCase().includes(filter.number.toLowerCase()) &&
          `${po.supplier.name} ${po.reference}`.toLowerCase().includes(filter.supplier.toLowerCase()),
      ),
    [orders, filter],
  );
  const selected = filtered.find((po) => po.id === selectedId) ?? null;

  const select = (po: WmsPurchaseOrder) => {
    setSelectedId(po.id);
    setCaptured({});
  };

  const scan = (code: string) => {
    if (!selected) {
      const po = filtered.find((p) => p.number.toLowerCase() === code.toLowerCase() || p.reference.toLowerCase() === code.toLowerCase());
      if (po) {
        select(po);
        toast.ok(t("Purchase order opened"), po.number);
      } else toast.error(t("No purchase order matches"), code);
      return;
    }
    const line = selected.lines.find((l) => l.sku.toLowerCase() === code.toLowerCase() || l.ean === code);
    if (!line) {
      toast.error(t("Article is not on this purchase order"), code);
      return;
    }
    const outstanding = line.ordered - line.received;
    setCaptured((current) => {
      const next = (current[line.variantId] ?? 0) + 1;
      if (next > outstanding) {
        toast.error(t("More than ordered"), `${line.sku} · ${outstanding}`);
        return current;
      }
      return { ...current, [line.variantId]: next };
    });
  };
  useScanner(scan, { suffix: scannerSuffix });

  const totalCaptured = sum(Object.values(captured));
  const totalOutstanding = selected ? sum(selected.lines.map((l) => l.ordered - l.received)) : 0;

  const book = async (everything: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await source.receive({ purchaseOrderId: selected.id, quantities: everything ? undefined : captured });
      toast.ok(t("Receipt booked"), selected.number);
      setCaptured({});
      setSelectedId(null);
      reload();
    } catch (err) {
      toast.error(t("Receipt failed"), (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t("Goods receipt")} subtitle={t("Receive supplier deliveries against purchase orders")} actions={<BigButton size="md" onClick={reload}>{t("Refresh")}</BigButton>}>
      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}
      <div className="grid h-full min-h-0 grid-cols-[380px_minmax(0,1fr)_420px] gap-5">
        {/* Left: open purchase orders */}
        <Panel title={t("Open purchase orders")} description={t("{n} open", { n: filtered.length })} flush>
          <div className="space-y-2 border-b border-line p-3">
            <Input placeholder={t("Purchase order no.")} value={filter.number} onChange={(e) => setFilter({ ...filter, number: e.target.value })} className="h-12" />
            <Input placeholder={t("Supplier or reference")} value={filter.supplier} onChange={(e) => setFilter({ ...filter, supplier: e.target.value })} className="h-12" />
          </div>
          {loading && !orders ? <EmptyState title={t("Loading…")} /> : null}
          {orders && filtered.length === 0 ? <EmptyState icon={PackageOpen} title={t("Nothing to receive")} body={t("Purchase orders marked as ordered in the ERP show up here.")} /> : null}
          {filtered.map((po) => {
            const outstanding = sum(po.lines.map((l) => l.ordered - l.received));
            return (
              <button key={po.id} type="button" onClick={() => select(po)} className={cn("touch-row", po.id === selectedId && "bg-accent-soft")}>
                <div className="min-w-0 flex-1 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[15px] font-semibold">{po.number}</span>
                    <Pill tone={statusTone(po.status)}>{t(po.status)}</Pill>
                  </div>
                  <div className="truncate text-[14px] text-muted">{po.supplier.name}{po.reference ? ` · ${po.reference}` : ""}</div>
                  <div className="text-[12.5px] text-faint">{t("Expected")} {formatDay(po.expectedAt, language)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[20px] font-semibold tabular-nums">{outstanding}</div>
                  <div className="text-[11.5px] text-faint">{t("units")}</div>
                </div>
              </button>
            );
          })}
        </Panel>

        {/* Middle: scanning */}
        <Panel title={selected ? `${selected.number} · ${selected.supplier.name}` : t("Scan")} description={selected ? t("Scan each unit or set quantities on the right") : t("Scan a purchase order number or choose one on the left")}>
          <ScanInput onScan={scan} placeholder={selected ? t("Scan article (SKU / EAN)") : t("Scan purchase order")} />
          {selected ? (
            <div className="mt-5 space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-[14px]">
                  <span className="font-medium">{t("Captured")}</span>
                  <span className="tabular-nums text-muted">{totalCaptured} / {totalOutstanding}</span>
                </div>
                <Progress value={totalCaptured} max={totalOutstanding} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <BigButton size="xl" variant="primary" icon={ArrowDownToLine} disabled={busy || totalCaptured === 0} onClick={() => book(false)}>
                  {t("Book {n} units", { n: totalCaptured })}
                </BigButton>
                <BigButton size="xl" variant="dark" icon={Truck} disabled={busy || totalOutstanding === 0} onClick={() => book(true)}>
                  {t("Book complete delivery")}
                </BigButton>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <BigButton icon={Printer} disabled>{t("Print article labels")}</BigButton>
                <BigButton onClick={() => setCaptured({})} disabled={totalCaptured === 0}>{t("Clear captured")}</BigButton>
              </div>
              <Notice tone="neutral">{t("Booked units land on the receiving bin. Use Internal → Stock transfer to put them away.")}</Notice>
            </div>
          ) : (
            <EmptyState icon={Truck} title={t("No purchase order selected")} body={t("Choose a delivery on the left to start receiving.")} />
          )}
        </Panel>

        {/* Right: lines */}
        <Panel title={t("Positions")} description={selected ? t("{n} positions", { n: selected.lines.length }) : undefined} flush>
          {selected ? (
            <Table>
              <thead>
                <tr>
                  <Th>{t("Article")}</Th>
                  <Th align="right">{t("Open")}</Th>
                  <Th align="right">{t("Now")}</Th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line) => {
                  const outstanding = line.ordered - line.received;
                  const now = captured[line.variantId] ?? 0;
                  return (
                    <tr key={line.id} className={cn(outstanding === 0 && "opacity-50")}>
                      <Td>
                        <div className="font-medium leading-tight">{line.name}</div>
                        <div className="font-mono text-[12.5px] text-muted">{line.sku}</div>
                        <div className="text-[12px] text-faint">{t("Ordered")} {line.ordered} · {t("Received")} {line.received}</div>
                      </Td>
                      <Td align="right" mono>{outstanding}</Td>
                      <Td align="right">
                        {outstanding === 0 ? <Done /> : <QtyStepper value={now} max={outstanding} onChange={(next) => setCaptured({ ...captured, [line.variantId]: next })} />}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState title={t("Positions appear here")} />
          )}
        </Panel>
      </div>
    </Page>
  );
}
