import { History } from "lucide-react";
import { useData, useLoad } from "@/data/provider";
import { cn, formatWhen } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { EmptyState, Panel } from "@/ui";

/** Latest stock movements – the same data the ERP shows on its stock movements page. */
export function MovementsPanel({ version }: { version: number }) {
  const t = useT();
  const source = useData();
  const { language } = useSettings();
  const { data } = useLoad(() => source.movements(40), [source, version]);
  return (
    <Panel title={t("Recent movements")} description={t("Synced with the ERP")} flush>
      {data && data.length === 0 ? <EmptyState icon={History} title={t("No movements yet")} body={t("Receipts, transfers, shipments and corrections appear here.")} /> : null}
      {data?.map((m) => (
        <div key={m.id} className="flex min-h-14 items-center gap-3 border-b border-line px-4 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">{m.name}</div>
            <div className="truncate font-mono text-[12px] text-muted">{m.sku} · {m.binCode} · {t(m.type)}{m.reference ? ` · ${m.reference}` : ""}</div>
          </div>
          <div className="text-right">
            <div className={cn("font-mono text-[16px] font-semibold tabular-nums", m.quantity > 0 ? "text-accent-strong" : "text-danger")}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</div>
            <div className="text-[11.5px] text-faint">{formatWhen(m.at, language)}</div>
          </div>
        </div>
      ))}
    </Panel>
  );
}
