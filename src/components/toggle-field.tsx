"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateRecord } from "@/server/actions/records";
import { cn } from "@/lib/format";
import { useTx } from "@/lib/i18n-client";

export function ToggleField({ entity, id, field, value, label, hint, disabled, onToggle }: { entity: string; id: string; field: string; value: boolean; label: string; hint?: string; disabled?: boolean; onToggle?: (next: boolean) => void }) {
  const tx = useTx();
  const router = useRouter();
  // Optimistic state, keyed to the server value it was derived from; once the server catches up it wins again.
  const [optimistic, setOptimistic] = useState<{ base: boolean; on: boolean } | null>(null);
  const on = optimistic && optimistic.base === value ? optimistic.on : value;
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    if (onToggle) {
      onToggle(next);
      return;
    }
    setOptimistic({ base: value, on: next });
    setError("");
    start(async () => {
      const result = await updateRecord(entity, id, field, next ? "true" : "false");
      if (result.ok) router.refresh();
      else {
        setOptimistic(null);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {hint ? <div className="text-[12px] text-faint">{hint}</div> : null}
        {error ? <div className="text-[12px] text-danger">{tx(error)}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled || pending}
        onClick={toggle}
        className={cn("relative mt-0.5 block h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-default", on ? "bg-ink" : "bg-ink/[0.14]", pending && "opacity-60")}
      >
        <span className={cn("absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-[var(--shadow-xs)] transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}
