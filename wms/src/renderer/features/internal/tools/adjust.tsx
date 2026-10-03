import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { WmsArticle } from "@shared/api";
import { useData, useLoad } from "@/data/provider";
import { cn } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { BigButton, Field, Input, Notice, Panel, QtyStepper, Select } from "@/ui";
import { useToast } from "@/ui/toast";
import { ArticlePicker } from "../article-picker";
import { MovementsPanel } from "./movements";

const reasons = ["Damaged", "Lost", "Found", "Counting difference", "Sample / marketing", "Other"];

export function AdjustTool() {
  const t = useT();
  const source = useData();
  const toast = useToast();
  const bins = useLoad(() => source.bins(), [source]);
  const [article, setArticle] = useState<WmsArticle | null>(null);
  const [binId, setBinId] = useState("");
  const [direction, setDirection] = useState<"plus" | "minus">("minus");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const onBin = article?.bins.find((b) => b.binId === binId)?.quantity ?? 0;

  const submit = async () => {
    if (!article || !binId) return;
    setBusy(true);
    try {
      const signed = direction === "minus" ? -quantity : quantity;
      await source.adjust({ variantId: article.variantId, binId, quantity: signed, reason: note.trim() ? `${t(reason)} – ${note.trim()}` : t(reason) });
      toast.ok(t("Adjustment booked"), `${signed > 0 ? "+" : ""}${signed} × ${article.sku}`);
      const refreshed = (await source.articles(article.sku)).find((a) => a.variantId === article.variantId) ?? null;
      setArticle(refreshed);
      setNote("");
      setVersion((n) => n + 1);
    } catch (err) {
      toast.error(t("Adjustment failed"), (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-5">
      <Panel title={t("Inventory adjustment")} description={t("Correct stock with a reason")}>
        <div className="space-y-5">
          <ArticlePicker value={article} onChange={(next) => { setArticle(next); setBinId(next?.bins[0]?.binId ?? ""); }} />
          {article ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("Bin")} hint={binId ? t("{n} on this bin", { n: onBin }) : undefined}>
                  <Select value={binId} onChange={(e) => setBinId(e.target.value)}>
                    <option value="">{t("Choose bin")}</option>
                    {bins.data?.filter((b) => b.active).map((b) => (
                      <option key={b.id} value={b.id}>{b.code} · {b.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("Reason")}>
                  <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                    {reasons.map((r) => (
                      <option key={r} value={r}>{t(r)}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line">
                  <button type="button" onClick={() => setDirection("minus")} className={cn("h-14 px-6 text-[16px] font-semibold", direction === "minus" ? "bg-danger text-white" : "bg-white")}>? {t("Remove")}</button>
                  <button type="button" onClick={() => setDirection("plus")} className={cn("h-14 px-6 text-[16px] font-semibold", direction === "plus" ? "bg-accent text-white" : "bg-white")}>+ {t("Add")}</button>
                </div>
                <Field label={t("Quantity")}>
                  <QtyStepper value={quantity} min={1} max={direction === "minus" ? Math.max(1, onBin) : undefined} onChange={setQuantity} size="lg" />
                </Field>
              </div>
              <Field label={t("Note")}>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Optional")} />
              </Field>
              <BigButton block size="xl" variant={direction === "minus" ? "danger" : "primary"} icon={SlidersHorizontal} disabled={busy || !binId || (direction === "minus" && quantity > onBin)} onClick={submit}>
                {t("Book adjustment")}
              </BigButton>
            </>
          ) : (
            <Notice tone="neutral">{t("Scan the article to correct. Every adjustment is written to the ERP with your reason.")}</Notice>
          )}
        </div>
      </Panel>
      <MovementsPanel version={version} />
    </div>
  );
}
