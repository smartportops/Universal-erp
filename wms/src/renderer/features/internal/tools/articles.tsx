import { useState } from "react";
import { Package, Search } from "lucide-react";
import type { WmsArticle } from "@shared/api";
import { useData, useLoad } from "@/data/provider";
import { cn } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { BigButton, EmptyState, Input, Notice, Panel, Pill, Table, Td, Th } from "@/ui";

export function ArticlesTool() {
  const t = useT();
  const source = useData();
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const articles = useLoad(() => source.articles(applied), [source, applied]);
  const [selected, setSelected] = useState<WmsArticle | null>(null);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_380px] gap-5">
      <Panel
        title={t("Articles")}
        description={t("{n} articles", { n: articles.data?.length ?? 0 })}
        actions={
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setApplied(query);
            }}
          >
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("SKU, EAN or name")} className="h-11 w-72" />
            <BigButton type="submit" size="md" variant="dark" icon={Search}>{t("Search")}</BigButton>
          </form>
        }
        flush
      >
        {articles.error ? <Notice tone="danger" className="m-4">{articles.error}</Notice> : null}
        {articles.data && articles.data.length === 0 ? <EmptyState icon={Package} title={t("No articles found")} /> : null}
        {articles.data && articles.data.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>{t("Article")}</Th>
                <Th>{t("Bins")}</Th>
                <Th align="right">{t("On hand")}</Th>
                <Th align="right">{t("Incoming")}</Th>
                <Th align="right">{t("Reserved")}</Th>
              </tr>
            </thead>
            <tbody>
              {articles.data.map((article) => (
                <tr key={article.variantId} onClick={() => setSelected(article)} className={cn("cursor-pointer hover:bg-surface", selected?.variantId === article.variantId && "bg-accent-soft")}>
                  <Td>
                    <div className="font-medium leading-tight">{article.name}</div>
                    <div className="font-mono text-[12.5px] text-muted">{article.sku}{article.ean ? ` · ${article.ean}` : ""}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {article.bins.slice(0, 3).map((b) => (
                        <Pill key={b.binId}>{b.binCode} · {b.quantity}</Pill>
                      ))}
                      {article.bins.length > 3 ? <Pill>+{article.bins.length - 3}</Pill> : null}
                    </div>
                  </Td>
                  <Td align="right" mono className={cn(article.onHand === 0 && "text-danger")}>{article.onHand}</Td>
                  <Td align="right" mono>{article.incoming}</Td>
                  <Td align="right" mono>{article.openDemand}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Panel>
      <Panel title={selected ? selected.productName : t("Details")} description={selected?.sku} flush>
        {selected ? (
          <div>
            <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
              {[
                [t("On hand"), selected.onHand],
                [t("Incoming"), selected.incoming],
                [t("Reserved"), selected.openDemand],
              ].map(([label, value]) => (
                <div key={String(label)} className="p-4 text-center">
                  <div className="text-[26px] font-semibold tabular-nums">{value}</div>
                  <div className="text-[12px] text-muted">{label}</div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 text-[12.5px] font-semibold uppercase tracking-wide text-muted">{t("Stock by bin")}</div>
            {selected.bins.length === 0 ? <p className="px-5 pb-5 text-[14px] text-muted">{t("No stock")}</p> : null}
            {selected.bins.map((b) => (
              <div key={b.binId} className="flex h-14 items-center border-t border-line px-5">
                <span className="flex-1 font-mono text-[15px] font-semibold">{b.binCode}</span>
                <span className="font-mono text-[17px] tabular-nums">{b.quantity}</span>
              </div>
            ))}
            <div className="p-4">
              <BigButton block disabled>{t("Print article label")}</BigButton>
            </div>
          </div>
        ) : (
          <EmptyState icon={Package} title={t("Select an article")} body={t("Tap a row to see where its stock is.")} />
        )}
      </Panel>
    </div>
  );
}
