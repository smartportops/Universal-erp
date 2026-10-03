import { useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useData, useLoad } from "@/data/provider";
import { cn } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useScanner } from "@/lib/scanner";
import { useSettings } from "@/lib/settings";
import { BigButton, EmptyState, Notice, Panel, QtyStepper, ScanInput, Table, Td, Th } from "@/ui";
import { useToast } from "@/ui/toast";

/** Count one bin: expected vs counted, book the differences as adjustments. */
export function CountTool() {
  const t = useT();
  const source = useData();
  const toast = useToast();
  const { scannerSuffix } = useSettings();
  const bins = useLoad(() => source.bins(), [source]);
  const articles = useLoad(() => source.articles(), [source]);
  const [binId, setBinId] = useState<string | null>(null);
  const [counted, setCounted] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const bin = bins.data?.find((b) => b.id === binId) ?? null;
  const rows = useMemo(() => {
    if (!bin || !articles.data) return [];
    const onBin = articles.data.map((a) => ({ article: a, expected: a.bins.find((b) => b.binId === bin.id)?.quantity ?? 0 })).filter((r) => r.expected > 0 || counted[r.article.variantId] !== undefined);
    return onBin.sort((a, b) => a.article.sku.localeCompare(b.article.sku));
  }, [bin, articles.data, counted]);

  const scan = (code: string) => {
    if (!bin) {
      const found = bins.data?.find((b) => b.code.toLowerCase() === code.toLowerCase());
      if (found) {
        setBinId(found.id);
        setCounted({});
      } else toast.error(t("No bin with that code"), code);
      return;
    }
    const article = articles.data?.find((a) => a.sku.toLowerCase() === code.toLowerCase() || a.ean === code);
    if (!article) {
      toast.error(t("Unknown article"), code);
      return;
    }
    setCounted((current) => ({ ...current, [article.variantId]: (current[article.variantId] ?? 0) + 1 }));
  };
  useScanner(scan, { suffix: scannerSuffix });

  const differences = rows.filter((r) => counted[r.article.variantId] !== undefined && counted[r.article.variantId] !== r.expected);

  const book = async () => {
    if (!bin) return;
    setBusy(true);
    try {
      for (const row of differences) {
        await source.adjust({ variantId: row.article.variantId, binId: bin.id, quantity: counted[row.article.variantId] - row.expected, reason: t("Counting difference") });
      }
      toast.ok(t("Count booked"), t("{n} differences", { n: differences.length }));
      setCounted({});
      articles.reload();
      bins.reload();
    } catch (err) {
      toast.error(t("Count failed"), (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[360px_minmax(0,1fr)] gap-5">
      <Panel title={t("Bins")} description={t("Scan or choose a bin to count")} flush>
        <div className="border-b border-line p-3">
          <ScanInput onScan={scan} placeholder={bin ? t("Scan counted article") : t("Scan bin label")} />
        </div>
        {bins.data?.filter((b) => b.active).map((b) => (
          <button key={b.id} type="button" onClick={() => { setBinId(b.id); setCounted({}); }} className={cn("touch-row", b.id === binId && "bg-accent-soft")}>
            <div className="min-w-0 flex-1 py-2">
              <div className="font-mono text-[16px] font-semibold">{b.code}</div>
              <div className="truncate text-[13px] text-muted">{b.name}</div>
            </div>
            <div className="text-right text-[13px] tabular-nums text-muted">{b.articles} {t("articles")} · {b.units} {t("units")}</div>
          </button>
        ))}
      </Panel>
      <Panel
        title={bin ? `${t("Stock count")} · ${bin.code}` : t("Stock count")}
        description={bin ? t("Expected vs counted · {n} differences", { n: differences.length }) : t("Count a bin and book the differences")}
        actions={bin ? <BigButton size="md" variant="primary" icon={ClipboardCheck} disabled={busy || differences.length === 0} onClick={book}>{t("Book differences")}</BigButton> : undefined}
        flush
      >
        {!bin ? <EmptyState icon={ClipboardCheck} title={t("No bin selected")} body={t("Scan a bin label to start counting.")} /> : null}
        {bin && rows.length === 0 ? <EmptyState title={t("Bin is empty")} body={t("Scan articles you find here anyway – they will be booked as found.")} /> : null}
        {bin && rows.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>{t("Article")}</Th>
                <Th align="right">{t("Expected")}</Th>
                <Th align="right">{t("Counted")}</Th>
                <Th align="right">{t("Difference")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const value = counted[row.article.variantId];
                const diff = value === undefined ? null : value - row.expected;
                return (
                  <tr key={row.article.variantId}>
                    <Td>
                      <div className="font-medium leading-tight">{row.article.name}</div>
                      <div className="font-mono text-[12.5px] text-muted">{row.article.sku}</div>
                    </Td>
                    <Td align="right" mono>{row.expected}</Td>
                    <Td align="right"><QtyStepper value={value ?? row.expected} onChange={(next) => setCounted({ ...counted, [row.article.variantId]: next })} /></Td>
                    <Td align="right" mono className={cn(diff && diff !== 0 ? (diff > 0 ? "text-accent-strong" : "text-danger") : "text-faint")}>{diff === null || diff === 0 ? "±0" : diff > 0 ? `+${diff}` : diff}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : null}
        {bin ? <div className="p-4"><Notice tone="neutral">{t("Untouched rows are treated as correct. Only changed rows are booked.")}</Notice></div> : null}
      </Panel>
    </div>
  );
}
