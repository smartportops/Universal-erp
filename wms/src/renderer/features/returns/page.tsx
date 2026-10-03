import { useState } from "react";
import { Search, Undo2 } from "lucide-react";
import type { WmsOrder, WmsReturnInput } from "@shared/api";
import { Page } from "@/app/shell";
import { useData } from "@/data/provider";
import { cn, formatDay, sum } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useScanner } from "@/lib/scanner";
import { useSettings } from "@/lib/settings";
import { BigButton, EmptyState, Field, Input, Notice, Panel, Pill, QtyStepper, ScanInput, Select, statusTone, Table, Td, Th } from "@/ui";
import { useToast } from "@/ui/toast";

type Disposition = WmsReturnInput["lines"][number]["disposition"];
type ReturnLine = { quantity: number; disposition: Disposition };

const reasons = ["Does not fit", "Not as described", "Damaged in transit", "Wrong article delivered", "Changed mind", "Other"];

/**
 * Returns: find a shipped order (by number, customer, tracking or scanned
 * article), choose the units coming back and book the return. The ERP creates
 * the return, receives it and writes the stock movement.
 */
export function ReturnsPage() {
  const t = useT();
  const source = useData();
  const toast = useToast();
  const { language, scannerSuffix } = useSettings();
  const [filter, setFilter] = useState({ q: "", number: "", customer: "", tracking: "" });
  const [results, setResults] = useState<WmsOrder[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<WmsOrder | null>(null);
  const [lines, setLines] = useState<Record<string, ReturnLine>>({});
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const search = async (override?: Partial<typeof filter>) => {
    const next = { ...filter, ...override };
    setSearching(true);
    try {
      setResults(await source.orders({ ...next, status: "shipped" }));
    } catch (err) {
      toast.error(t("Search failed"), (err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const choose = (order: WmsOrder) => {
    setSelected(order);
    setLines({});
  };

  const scan = (code: string) => {
    if (!selected) {
      setFilter((f) => ({ ...f, q: code }));
      void search({ q: code });
      return;
    }
    const line = selected.lines.find((l) => l.sku.toLowerCase() === code.toLowerCase() || l.ean === code);
    if (!line) {
      toast.error(t("Article is not on this order"), code);
      return;
    }
    setLines((current) => {
      const entry = current[line.variantId] ?? { quantity: 0, disposition: "inspect" as Disposition };
      if (entry.quantity >= line.shipped) {
        toast.error(t("More than shipped"), line.sku);
        return current;
      }
      return { ...current, [line.variantId]: { ...entry, quantity: entry.quantity + 1 } };
    });
  };
  useScanner(scan, { suffix: scannerSuffix });

  const total = sum(Object.values(lines).map((l) => l.quantity));

  const book = async () => {
    if (!selected || total === 0) return;
    setBusy(true);
    try {
      const result = await source.createReturn({
        orderId: selected.id,
        reason: note.trim() ? `${t(reason)} – ${note.trim()}` : t(reason),
        lines: Object.entries(lines).filter(([, l]) => l.quantity > 0).map(([variantId, l]) => ({ variantId, quantity: l.quantity, disposition: l.disposition })),
      });
      toast.ok(t("Return booked"), `${selected.number} · ${result.returnNumber}`);
      setSelected(null);
      setLines({});
      setNote("");
      void search();
    } catch (err) {
      toast.error(t("Return failed"), (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t("Returns")} subtitle={t("Find a shipped order and book the units coming back")}>
      <div className="grid h-full min-h-0 grid-cols-[380px_minmax(0,1fr)_440px] gap-5">
        <Panel title={t("Find order")} flush>
          <form
            className="space-y-2 border-b border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <Input placeholder={t("Order number")} value={filter.number} onChange={(e) => setFilter({ ...filter, number: e.target.value })} className="h-12" />
            <Input placeholder={t("Customer or company")} value={filter.customer} onChange={(e) => setFilter({ ...filter, customer: e.target.value })} className="h-12" />
            <Input placeholder={t("Tracking or shipment no.")} value={filter.tracking} onChange={(e) => setFilter({ ...filter, tracking: e.target.value })} className="h-12" />
            <Input placeholder={t("Anything (SKU, name, …)")} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} className="h-12" />
            <BigButton block type="submit" variant="dark" icon={Search} disabled={searching}>{t("Search")}</BigButton>
          </form>
          {results === null ? <EmptyState icon={Search} title={t("Search shipped orders")} body={t("Scan an article or a tracking number to search immediately.")} /> : null}
          {results && results.length === 0 ? <EmptyState title={t("No shipped orders found")} /> : null}
          {results?.map((order) => (
            <button key={order.id} type="button" onClick={() => choose(order)} className={cn("touch-row", selected?.id === order.id && "bg-accent-soft")}>
              <div className="min-w-0 flex-1 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[15px] font-semibold">{order.number}</span>
                  <Pill tone={statusTone(order.status)}>{t(order.status)}</Pill>
                </div>
                <div className="truncate text-[14px] text-muted">{order.customer.company || order.customer.name} · {order.shipTo.city}</div>
                <div className="text-[12.5px] text-faint">{order.shipments.map((s) => `${s.carrier} ${s.trackingNumber}`.trim()).join(", ") || "–"}</div>
              </div>
              <div className="text-right text-[13px] text-faint">{formatDay(order.shipments[0]?.shippedAt, language)}</div>
            </button>
          ))}
        </Panel>

        <Panel title={selected ? `${selected.number} · ${selected.customer.company || selected.customer.name}` : t("Return")} description={selected ? t("Scan each returned unit or set quantities on the right") : t("Choose an order on the left")}>
          <ScanInput onScan={scan} placeholder={selected ? t("Scan returned article") : t("Scan article or tracking number")} />
          {selected ? (
            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("Reason")}>
                  <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                    {reasons.map((r) => (
                      <option key={r} value={r}>{t(r)}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("Note")}>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Optional")} />
                </Field>
              </div>
              <BigButton block size="xl" variant="primary" icon={Undo2} disabled={busy || total === 0} onClick={book}>
                {t("Book return · {n} units", { n: total })}
              </BigButton>
              <Notice tone="neutral">{t("Units marked “Restock” go back to sellable stock; “Inspect” and “Scrap” land on the returns bin.")}</Notice>
            </div>
          ) : (
            <EmptyState icon={Undo2} title={t("No order selected")} />
          )}
        </Panel>

        <Panel title={t("Positions")} flush>
          {selected ? (
            <Table>
              <thead>
                <tr>
                  <Th>{t("Article")}</Th>
                  <Th align="right">{t("Return")}</Th>
                  <Th>{t("Disposition")}</Th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line) => {
                  const entry = lines[line.variantId] ?? { quantity: 0, disposition: "inspect" as Disposition };
                  return (
                    <tr key={line.id}>
                      <Td>
                        <div className="font-medium leading-tight">{line.name}</div>
                        <div className="font-mono text-[12.5px] text-muted">{line.sku} · {t("shipped")} {line.shipped}</div>
                      </Td>
                      <Td align="right">
                        <QtyStepper value={entry.quantity} max={line.shipped} onChange={(quantity) => setLines({ ...lines, [line.variantId]: { ...entry, quantity } })} />
                      </Td>
                      <Td>
                        <Select value={entry.disposition} onChange={(e) => setLines({ ...lines, [line.variantId]: { ...entry, disposition: e.target.value as Disposition } })} className="h-12 w-36">
                          <option value="restock">{t("Restock")}</option>
                          <option value="inspect">{t("Inspect")}</option>
                          <option value="scrap">{t("Scrap")}</option>
                        </Select>
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
