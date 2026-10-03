import { useState } from "react";
import { Tag } from "lucide-react";
import type { WmsArticle } from "@shared/api";
import { useData } from "@/data/provider";
import { cn } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { BigButton, Field, Input, Notice, Panel, QtyStepper, Select } from "@/ui";
import { useToast } from "@/ui/toast";
import { ArticlePicker } from "../article-picker";

const conditions = [
  { key: "a", label: "A · New", tone: "bg-accent text-white" },
  { key: "b", label: "B · Like new", tone: "bg-info text-white" },
  { key: "c", label: "C · Used", tone: "bg-warn text-white" },
  { key: "blocked", label: "Blocked / QA", tone: "bg-ink text-white" },
  { key: "damaged", label: "Damaged", tone: "bg-danger text-white" },
];

/**
 * Change item condition. The ERP tracks stock per bin today, not per
 * condition, so this tool books the change as a transfer onto a condition bin
 * (e.g. "B-STOCK", "QA", "DAMAGED") – the data source decides how to store
 * it once the ERP has native conditions. UI and flow are final.
 */
export function ConditionTool() {
  const t = useT();
  const source = useData();
  const toast = useToast();
  const [article, setArticle] = useState<WmsArticle | null>(null);
  const [fromBinId, setFromBinId] = useState("");
  const [condition, setCondition] = useState("b");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const max = article?.bins.find((b) => b.binId === fromBinId)?.quantity ?? 0;

  const submit = async () => {
    if (!article || !fromBinId) return;
    setBusy(true);
    try {
      const bins = await source.bins();
      const code = { a: "A-STOCK", b: "B-STOCK", c: "C-STOCK", blocked: "QA", damaged: "DAMAGED" }[condition] ?? "QA";
      let target = bins.find((b) => b.code.toLowerCase() === code.toLowerCase());
      if (!target) target = await source.createBin({ warehouseId: bins[0]?.warehouseId ?? "", code, name: t(conditions.find((c) => c.key === condition)?.label ?? code), type: "condition" });
      await source.transfer({ variantId: article.variantId, fromBinId, toBinId: target.id, quantity });
      toast.ok(t("Condition changed"), `${quantity} × ${article.sku} → ${target.code}`);
      const refreshed = (await source.articles(article.sku)).find((a) => a.variantId === article.variantId) ?? null;
      setArticle(refreshed);
      setFromBinId(refreshed?.bins[0]?.binId ?? "");
      setNote("");
    } catch (err) {
      toast.error(t("Change failed"), (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t("Change item condition")} description={t("Mark units as B-stock, damaged or blocked")}>
      <div className="max-w-3xl space-y-5">
        <ArticlePicker value={article} onChange={(next) => { setArticle(next); setFromBinId(next?.bins[0]?.binId ?? ""); setQuantity(1); }} />
        {article ? (
          <>
            <Field label={t("From bin")}>
              <Select value={fromBinId} onChange={(e) => setFromBinId(e.target.value)}>
                {article.bins.map((b) => (
                  <option key={b.binId} value={b.binId}>{b.binCode} · {b.quantity}</option>
                ))}
              </Select>
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-muted">{t("New condition")}</span>
              <div className="grid grid-cols-5 gap-2">
                {conditions.map((c) => (
                  <button key={c.key} type="button" onClick={() => setCondition(c.key)} className={cn("h-16 rounded-xl border text-[14px] font-semibold transition-colors", condition === c.key ? `${c.tone} border-transparent` : "border-line bg-white hover:bg-surface")}>
                    {t(c.label)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] items-end gap-4">
              <Field label={t("Quantity")}>
                <QtyStepper value={quantity} min={1} max={Math.max(1, max)} onChange={setQuantity} size="lg" />
              </Field>
              <Field label={t("Note")}>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Optional")} />
              </Field>
            </div>
            <BigButton block size="xl" variant="primary" icon={Tag} disabled={busy || max === 0 || quantity > max} onClick={submit}>{t("Change condition")}</BigButton>
          </>
        ) : (
          <Notice tone="neutral">{t("Scan the article whose condition changed. Units are moved onto the matching condition bin so they are no longer sellable as new.")}</Notice>
        )}
      </div>
    </Panel>
  );
}
