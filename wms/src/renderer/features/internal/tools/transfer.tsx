import { useState } from "react";
import { ArrowRight, ArrowRightLeft } from "lucide-react";
import type { WmsArticle } from "@shared/api";
import { useData, useLoad } from "@/data/provider";
import { cn } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { BigButton, EmptyState, Field, Notice, Panel, QtyStepper, Select } from "@/ui";
import { useToast } from "@/ui/toast";
import { ArticlePicker } from "../article-picker";
import { MovementsPanel } from "./movements";

export function TransferTool() {
  const t = useT();
  const source = useData();
  const toast = useToast();
  const bins = useLoad(() => source.bins(), [source]);
  const [article, setArticle] = useState<WmsArticle | null>(null);
  const [fromBinId, setFromBinId] = useState("");
  const [toBinId, setToBinId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const from = article?.bins.find((b) => b.binId === fromBinId) ?? null;
  const max = from?.quantity ?? 0;

  const pickArticle = (next: WmsArticle | null) => {
    setArticle(next);
    setFromBinId(next?.bins[0]?.binId ?? "");
    setQuantity(Math.min(1, next?.bins[0]?.quantity ?? 1));
  };

  const submit = async () => {
    if (!article || !fromBinId || !toBinId) return;
    setBusy(true);
    try {
      await source.transfer({ variantId: article.variantId, fromBinId, toBinId, quantity });
      toast.ok(t("Transfer booked"), `${quantity} × ${article.sku}`);
      const refreshed = (await source.articles(article.sku)).find((a) => a.variantId === article.variantId) ?? null;
      pickArticle(refreshed);
      setVersion((n) => n + 1);
    } catch (err) {
      toast.error(t("Transfer failed"), (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-5">
      <Panel title={t("Stock transfer")} description={t("Move units from one bin to another")}>
        <div className="space-y-5">
          <ArticlePicker value={article} onChange={pickArticle} />
          {article ? (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <Field label={t("From bin")}>
                  <Select value={fromBinId} onChange={(e) => { setFromBinId(e.target.value); setQuantity(1); }}>
                    {article.bins.length === 0 ? <option value="">{t("No stock")}</option> : null}
                    {article.bins.map((b) => (
                      <option key={b.binId} value={b.binId}>{b.binCode} · {b.quantity}</option>
                    ))}
                  </Select>
                </Field>
                <ArrowRight className="mb-4 size-6 text-faint" />
                <Field label={t("To bin")}>
                  <Select value={toBinId} onChange={(e) => setToBinId(e.target.value)}>
                    <option value="">{t("Choose bin")}</option>
                    {bins.data?.filter((b) => b.active && b.id !== fromBinId).map((b) => (
                      <option key={b.id} value={b.id}>{b.code} · {b.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <Field label={t("Quantity")}>
                  <QtyStepper value={quantity} min={1} max={Math.max(1, max)} onChange={setQuantity} size="lg" />
                </Field>
                <div className="flex gap-2">
                  {[1, 5, 10, max].filter((n, i, a) => n > 0 && a.indexOf(n) === i).map((n) => (
                    <BigButton key={n} size="md" variant={quantity === n ? "dark" : "secondary"} onClick={() => setQuantity(n)} className={cn("min-w-14")}>
                      {n === max ? t("All") : n}
                    </BigButton>
                  ))}
                </div>
              </div>
              <BigButton block size="xl" variant="primary" icon={ArrowRightLeft} disabled={busy || !toBinId || max === 0 || quantity > max} onClick={submit}>
                {t("Book transfer")}
              </BigButton>
            </>
          ) : (
            <Notice tone="neutral">{t("Scan the article you want to move. Then choose source and target bin.")}</Notice>
          )}
        </div>
      </Panel>
      {article ? (
        <Panel title={t("Stock by bin")} description={article.sku} flush>
          {article.bins.length === 0 ? <EmptyState title={t("No stock")} /> : null}
          {article.bins.map((b) => (
            <button key={b.binId} type="button" onClick={() => setFromBinId(b.binId)} className={cn("touch-row", b.binId === fromBinId && "bg-accent-soft")}>
              <span className="flex-1 font-mono text-[16px] font-semibold">{b.binCode}</span>
              <span className="font-mono text-[18px] tabular-nums">{b.quantity}</span>
            </button>
          ))}
        </Panel>
      ) : (
        <MovementsPanel version={version} />
      )}
    </div>
  );
}
