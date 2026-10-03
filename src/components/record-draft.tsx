"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InlineEdit } from "@/components/inline-edit";
import { buttonClass } from "@/components/ui";
import { useTx } from "@/lib/i18n-client";

// Generic deferred editing for a single record. Field edits stay in the client
// until "Create" or "Save" is clicked; the page passes the server actions in.

type DraftApi = {
  values: Record<string, string>;
  initial: Record<string, string>;
  set: (key: string, value: string) => void;
  dirty: boolean;
  creating: boolean;
  error: string;
  pending: boolean;
  commit: () => void;
};

const DraftContext = createContext<DraftApi | null>(null);

function useDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("Record draft is missing.");
  return value;
}

export function RecordDraftProvider({
  mode,
  initial,
  create,
  save,
  children,
}: {
  mode: "create" | "edit";
  initial: Record<string, string>;
  create?: (values: Record<string, string>) => Promise<{ error: string } | undefined | void>;
  save?: (values: Record<string, string>) => Promise<{ ok: true } | { ok: false; error: string }>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  function commit() {
    setError("");
    start(async () => {
      if (mode === "create") {
        const result = create ? await create(values) : undefined;
        if (result && "error" in result) setError(result.error);
        return;
      }
      if (!save) return;
      const result = await save(values);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const api: DraftApi = {
    values,
    initial,
    set: (key, value) => setValues((current) => ({ ...current, [key]: value })),
    dirty,
    creating: mode === "create",
    error,
    pending,
    commit,
  };

  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>;
}

export function SaveRecordButton() {
  const draft = useDraft();
  const tx = useTx();
  const disabled = draft.pending || (!draft.creating && !draft.dirty);
  return (
    <button type="button" disabled={disabled} onClick={draft.commit} className={buttonClass("primary")}>
      {draft.pending ? tx(draft.creating ? "Creating" : "Saving") : tx(draft.creating ? "Create" : "Save")}
    </button>
  );
}

export function RecordDraftNotice() {
  const draft = useDraft();
  const tx = useTx();
  if (!draft.error) return null;
  return <p className="mb-4 text-[13px] text-danger">{tx(draft.error)}</p>;
}

export function RecordField({
  k,
  display,
  ...props
}: {
  k: string;
  entity: string;
  id: string;
  field: string;
  display?: React.ReactNode;
  type?: "text" | "number" | "money" | "date" | "textarea" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
  textClassName?: string;
  autoFocus?: boolean;
}) {
  const draft = useDraft();
  const value = draft.values[k] ?? "";
  return <InlineEdit {...props} value={value} display={value === draft.initial[k] ? display : undefined} onCommit={(next) => draft.set(k, next)} />;
}
