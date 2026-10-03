"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { updateCustomValue, updateRecord, type UpdateResult } from "@/server/actions/records";
import { cn } from "@/lib/format";
import { useTx } from "@/lib/i18n-client";

type Option = { value: string; label: string };

type Props = {
  entity: string;
  id: string;
  field: string;
  value: string;
  display?: React.ReactNode;
  type?: "text" | "number" | "money" | "date" | "textarea" | "select";
  options?: Option[];
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
  textClassName?: string;
  /** Start in edit mode with the input focused (used for freshly created records). */
  autoFocus?: boolean;
  /** When set, the value stays local and is not written until the caller saves. */
  onCommit?: (value: string) => void;
};

export function InlineEdit(props: Props) {
  return <Editable {...props} save={(raw) => updateRecord(props.entity, props.id, props.field, raw)} />;
}

export function InlineCustomField({ definitionId, entityId, value, disabled }: { definitionId: string; entityId: string; value: string; disabled?: boolean }) {
  return (
    <Editable
      entity="custom"
      id={entityId}
      field={definitionId}
      value={value}
      disabled={disabled}
      placeholder="Add"
      save={(raw) => updateCustomValue(definitionId, entityId, raw)}
    />
  );
}

function Editable({
  value,
  display,
  type = "text",
  options,
  placeholder = "Empty",
  disabled,
  align = "left",
  mono,
  className,
  textClassName,
  autoFocus,
  onCommit,
  save,
}: Props & { save: (raw: string) => Promise<UpdateResult> }) {
  const router = useRouter();
  const tx = useTx();
  const hint = tx(placeholder);
  const [editing, setEditing] = useState(Boolean(autoFocus && !disabled));
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    setShown(value);
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!saved) return;
    const handle = setTimeout(() => setSaved(false), 1400);
    return () => clearTimeout(handle);
  }, [saved]);

  function commit(next: string) {
    setEditing(false);
    if (onCommit) {
      if (next === shown) return;
      setShown(next);
      onCommit(next);
      return;
    }
    if (next === shown) return;
    const previous = shown;
    setShown(next);
    setError("");
    startTransition(async () => {
      const result = await save(next);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setShown(previous);
        setDraft(previous);
        setError(result.error);
      }
    });
  }

  const base = cn(
    "w-[calc(100%+0.75rem)] rounded-md px-1.5 py-1 -mx-1.5",
    textClassName ?? "text-[13px]",
    align === "right" && "text-right",
    mono && "font-mono text-[13px]",
  );

  if (type === "select") {
    return (
      <span className={cn("relative block", className)}>
        <select
          value={shown}
          disabled={disabled || pending}
          onChange={(event) => commit(event.target.value)}
          className={cn(base, "cursor-pointer appearance-none bg-transparent pr-6 outline-none hover:bg-black/[0.04] focus:bg-black/[0.04] disabled:cursor-default disabled:hover:bg-transparent", saved && "bg-ok-soft")}
        >
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {!disabled ? <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-faint">{"\u25be"}</span> : null}
        <Feedback error={error} />
      </span>
    );
  }

  if (disabled) {
    return <span className={cn(base, "block", !shown && "text-faint", className)}>{display ?? (shown || "\u2014")}</span>;
  }

  if (editing) {
    const shared = {
      ref: input,
      value: draft,
      placeholder: hint,
      autoFocus: true,
      onChange: (event: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(event.target.value),
      onBlur: () => commit(draft),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Escape") {
          setDraft(shown);
          setEditing(false);
        }
        if (event.key === "Enter" && (type !== "textarea" || event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commit(draft);
        }
      },
      className: cn(base, "block bg-surface outline-none ring-2 ring-accent/30"),
    };
    return (
      <span className={cn("block", className)}>
        {type === "textarea" ? (
          <textarea {...shared} rows={3} />
        ) : (
          <input {...shared} type={type === "date" ? "date" : "text"} inputMode={type === "number" || type === "money" ? "decimal" : undefined} />
        )}
      </span>
    );
  }

  return (
    <span className={cn("relative block", className)}>
      <button
        type="button"
        onClick={() => {
          setDraft(shown);
          setEditing(true);
        }}
        className={cn(base, "block cursor-text text-left transition-colors hover:bg-black/[0.04]", align === "right" && "text-right", !shown && "text-faint", pending && "opacity-60", saved && "bg-ok-soft")}
      >
        {shown === value && display ? display : shown || hint}
      </button>
      <Feedback error={error} />
    </span>
  );
}

function Feedback({ error }: { error: string }) {
  const tx = useTx();
  if (!error) return null;
  return <span className="mt-0.5 block text-xs text-danger">{tx(error)}</span>;
}
