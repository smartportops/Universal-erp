"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { useTx } from "@/lib/i18n-client";

type Select = { name: string; value?: string; placeholder: string; options: { value: string; label: string }[] };

export function Filters({
  action,
  q,
  placeholder,
  selects = [],
  hidden = {},
  children,
}: {
  action: string;
  q?: string;
  placeholder?: string;
  selects?: Select[];
  hidden?: Record<string, string | undefined>;
  children?: React.ReactNode;
}) {
  const tx = useTx();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [text, setText] = useState(q ?? "");
  const first = useRef(true);

  function go() {
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form.current).entries()) {
      if (typeof value === "string" && value) params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${action}?${query}` : action);
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const handle = setTimeout(go, 220);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        go();
      }}
      className="mb-3 flex flex-wrap items-center gap-2"
    >
      {Object.entries(hidden).map(([key, value]) => (value ? <input key={key} type="hidden" name={key} value={value} /> : null))}
      <label className="relative w-full max-w-[280px]">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          name="q"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder ?? tx("Search")}
          className="h-8 w-full rounded-lg bg-surface pl-8 pr-3 text-[13px] shadow-[var(--shadow-xs)] outline-none ring-1 ring-line-strong placeholder:text-faint focus:ring-2 focus:ring-accent/40"
        />
      </label>
      {selects.map((select) => (
        <select
          key={select.name}
          name={select.name}
          defaultValue={select.value ?? ""}
          onChange={go}
          className={cn(
            "h-8 rounded-lg bg-surface pl-2.5 pr-7 text-[13px] shadow-[var(--shadow-xs)] outline-none ring-1 ring-line-strong focus:ring-2 focus:ring-accent/40",
            select.value ? "text-ink" : "text-muted",
          )}
        >
          <option value="">{select.placeholder}</option>
          {select.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}
      {children}
    </form>
  );
}
