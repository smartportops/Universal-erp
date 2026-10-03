"use client";

import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/format";
import { useTx } from "@/lib/i18n-client";

export type VariantOption = { id: string; sku: string; name: string; ean?: string; amount: string; stock?: number };
type Line = { variantId: string; quantity: number; amount: string };

function cents(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function LineEditor({ variants, initial = [], amountLabel = "Price" }: { variants: VariantOption[]; initial?: Line[]; amountLabel?: string }) {
  const tx = useTx();
  const [lines, setLines] = useState<Line[]>(initial);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(variants.map((variant) => [variant.id, variant])), [variants]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return variants
      .filter((variant) => !q || `${variant.sku} ${variant.name} ${variant.ean ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, variants]);

  const payload = JSON.stringify(lines.map((line) => ({ variantId: line.variantId, quantity: Number(line.quantity), amount: line.amount })));
  const total = lines.reduce((sum, line) => sum + cents(line.amount) * line.quantity, 0);

  function add(variant: VariantOption | undefined) {
    if (!variant) return;
    setLines((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      if (existing) return current.map((line) => (line.variantId === variant.id ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, { variantId: variant.id, quantity: 1, amount: variant.amount }];
    });
    setQuery("");
    setActive(0);
    input.current?.focus();
  }

  function update(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  return (
    <div>
      <input type="hidden" name="lines" value={payload} />
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          ref={input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(current + 1, matches.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(current - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              add(matches[active]);
            }
          }}
          placeholder={tx("Search a product: name, SKU or EAN")}
          className="h-10 w-full rounded-lg bg-surface pl-9 pr-3 text-[13px] shadow-[var(--shadow-xs)] outline-none ring-1 ring-line-strong placeholder:text-faint focus:ring-2 focus:ring-accent/40"
        />
        {focus && matches.length ? (
          <div className="absolute left-0 right-0 top-11 z-20 overflow-hidden rounded-xl bg-surface p-1 shadow-[var(--shadow-lg)]">
            {matches.map((variant, index) => (
              <button
                key={variant.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => add(variant)}
                className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px]", index === active && "bg-subtle")}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{variant.name}</span>
                  <span className="ml-2 font-mono text-[12px] text-muted">{variant.sku}</span>
                </span>
                <span className="shrink-0 text-[12px] text-muted tabular-nums">
                  {variant.stock != null ? <span className={variant.stock <= 0 ? "text-danger" : ""}>{tx("{n} in stock", { n: variant.stock })} · </span> : null}
                  {variant.amount} €
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">{tx("No lines yet. Search for a product above and press Enter.")}</div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg ring-1 ring-line">
          <div className="grid grid-cols-[minmax(0,1fr)_76px_96px_92px_28px] gap-2 border-b border-line bg-subtle px-3 py-1.5 text-[12px] text-muted">
            <span>{tx("Product")}</span>
            <span className="text-right">{tx("Quantity")}</span>
            <span className="text-right">{tx(amountLabel)}</span>
            <span className="text-right">{tx("Line total")}</span>
            <span />
          </div>
          {lines.map((line, index) => {
            const variant = byId.get(line.variantId);
            return (
              <div key={line.variantId} className="grid grid-cols-[minmax(0,1fr)_76px_96px_92px_28px] items-center gap-2 border-b border-line px-3 py-2 last:border-0">
                <span className="min-w-0 truncate text-[13px]">
                  <span className="font-medium">{variant?.name}</span>
                  <span className="ml-2 font-mono text-[12px] text-muted">{variant?.sku}</span>
                </span>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(event) => update(index, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                  className="h-8 w-full rounded-md bg-surface px-2 text-right text-[13px] tabular-nums outline-none ring-1 ring-line-strong focus:ring-2 focus:ring-accent/40"
                />
                <input
                  value={line.amount}
                  inputMode="decimal"
                  onChange={(event) => update(index, { amount: event.target.value })}
                  className="h-8 w-full rounded-md bg-surface px-2 text-right text-[13px] tabular-nums outline-none ring-1 ring-line-strong focus:ring-2 focus:ring-accent/40"
                />
                <span className="text-right text-[13px] font-medium tabular-nums">{euro.format((cents(line.amount) * line.quantity) / 100)}</span>
                <button
                  type="button"
                  aria-label={tx("Remove")}
                  onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                  className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-ink/[0.04] hover:text-ink"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          <div className="flex justify-between bg-subtle px-3 py-2 text-[13px] font-semibold">
            <span>{tx("Grand total")}</span>
            <span className="tabular-nums">{euro.format(total / 100)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
