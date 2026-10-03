import { useEffect, useState } from "react";
import { Package, X } from "lucide-react";
import type { WmsArticle } from "@shared/api";
import { useData } from "@/data/provider";
import { cn } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { ScanInput } from "@/ui";

/**
 * Scan or search an article. Shows up to 8 matches as big rows; exact SKU/EAN
 * matches are selected immediately. Reused by all Internal tools.
 */
export function ArticlePicker({ value, onChange, placeholder }: { value: WmsArticle | null; onChange: (article: WmsArticle | null) => void; placeholder?: string }) {
  const t = useT();
  const source = useData();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<WmsArticle[]>([]);

  useEffect(() => {
    if (!query) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    source.articles(query).then((list) => {
      if (cancelled) return;
      const exact = list.find((a) => a.sku.toLowerCase() === query.toLowerCase() || a.ean === query);
      if (exact) {
        onChange(exact);
        setQuery("");
        setMatches([]);
      } else setMatches(list.slice(0, 8));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, source]);

  if (value) {
    return (
      <div className="flex min-h-16 items-center gap-4 rounded-xl border border-accent bg-accent-soft px-4">
        <Package className="size-6 shrink-0 text-accent-strong" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">{value.name}</div>
          <div className="font-mono text-[13px] text-muted">{value.sku}{value.ean ? ` · ${value.ean}` : ""} · {t("On hand")} {value.onHand}</div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded-lg p-2 text-muted hover:bg-white">
          <X className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ScanInput onScan={setQuery} placeholder={placeholder ?? t("Scan or search article")} />
      {matches.length ? (
        <div className="overflow-hidden rounded-xl border border-line">
          {matches.map((article) => (
            <button key={article.variantId} type="button" onClick={() => { onChange(article); setQuery(""); setMatches([]); }} className={cn("touch-row last:border-b-0")}>
              <div className="min-w-0 flex-1 py-2.5">
                <div className="truncate font-medium">{article.name}</div>
                <div className="font-mono text-[12.5px] text-muted">{article.sku}</div>
              </div>
              <div className="font-mono text-[15px] tabular-nums">{article.onHand}</div>
            </button>
          ))}
        </div>
      ) : query ? (
        <p className="px-1 text-[13px] text-muted">{t("No article matches “{q}”", { q: query })}</p>
      ) : null}
    </div>
  );
}
