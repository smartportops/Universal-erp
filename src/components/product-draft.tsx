"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProduct, saveProduct, type ProductDraftPayload } from "@/server/actions/catalog";
import { InlineEdit } from "@/components/inline-edit";
import { ToggleField } from "@/components/toggle-field";
import { RichText } from "@/components/rich-text";
import { ImageUpload } from "@/components/image-upload";
import { buttonClass, Status } from "@/components/ui";
import { useTx } from "@/lib/i18n-client";
import type { Tone } from "@/lib/labels";

type DraftApi = {
  values: Record<string, string>;
  initial: Record<string, string>;
  set: (key: string, value: string) => void;
  dirty: boolean;
  creating: boolean;
  error: string;
  pending: boolean;
  commit: () => void;
  files: { file: File; url: string }[];
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  supplierIds: string[];
  addSupplier: (id: string) => void;
  removeSupplier: (id: string) => void;
};

const DraftContext = createContext<DraftApi | null>(null);

function useDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("Product draft is missing.");
  return value;
}

export function ProductDraftProvider({
  mode,
  productId,
  variantIds,
  initial,
  children,
}: {
  mode: "create" | "edit";
  productId: string;
  variantIds: string[];
  initial: Record<string, string>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  function set(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function commit() {
    setError("");
    start(async () => {
      if (mode === "create") {
        const formData = new FormData();
        for (const [key, value] of Object.entries(values)) formData.set(key, value);
        formData.set("supplierIds", supplierIds.join(","));
        for (const item of files) formData.append("files", item.file);
        const result = await createProduct(formData);
        if (result) setError(result.error);
        return;
      }
      const payload: ProductDraftPayload = {
        name: values["product:name"] ?? "",
        status: values["product:status"] ?? "draft",
        category: values["product:category"] ?? "",
        taxRateId: values["product:taxRateId"] ?? "",
        description: values["product:description"] ?? "",
        allowOversell: values["product:allowOversell"] === "true",
        trackSerialsIn: values["product:trackSerialsIn"] === "true",
        trackSerialsOut: values["product:trackSerialsOut"] === "true",
        variants: variantIds.map((id) => ({
          id,
          name: values[`variant:${id}:name`] ?? "",
          sku: values[`variant:${id}:sku`] ?? "",
          ean: values[`variant:${id}:ean`] ?? "",
          price: values[`variant:${id}:price`] ?? "",
          cost: values[`variant:${id}:cost`] ?? "",
          weight: values[`variant:${id}:weight`] ?? "0",
          reorder: values[`variant:${id}:reorder`] ?? "0",
        })),
      };
      const result = await saveProduct(productId, payload);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const api: DraftApi = {
    values,
    initial,
    set,
    dirty,
    creating: mode === "create",
    error,
    pending,
    commit,
    files,
    addFiles: (list) => setFiles((current) => [...current, ...list.map((file) => ({ file, url: URL.createObjectURL(file) }))]),
    removeFile: (index) =>
      setFiles((current) => {
        const next = [...current];
        const gone = next.splice(index, 1)[0];
        if (gone) URL.revokeObjectURL(gone.url);
        return next;
      }),
    supplierIds,
    addSupplier: (id) => setSupplierIds((current) => (current.includes(id) ? current : [...current, id])),
    removeSupplier: (id) => setSupplierIds((current) => current.filter((item) => item !== id)),
  };

  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>;
}

export function SaveProductButton() {
  const draft = useDraft();
  const tx = useTx();
  const disabled = draft.pending || (!draft.creating && !draft.dirty);
  return (
    <button type="button" disabled={disabled} onClick={draft.commit} className={buttonClass("primary")}>
      {draft.pending ? tx(draft.creating ? "Creating" : "Saving") : tx(draft.creating ? "Create" : "Save")}
    </button>
  );
}

export function DraftNotice() {
  const draft = useDraft();
  const tx = useTx();
  if (!draft.error) return null;
  return <p className="mb-4 text-[13px] text-danger">{tx(draft.error)}</p>;
}

export function DraftStatus({ map }: { map: Record<string, { label: string; tone: Tone }> }) {
  const draft = useDraft();
  return <Status map={map} value={draft.values["product:status"] || "draft"} />;
}

export function DraftField({
  k,
  display,
  ...props
}: {
  k: string;
  entity: string;
  id: string;
  field: string;
  display?: React.ReactNode;
  type?: "text" | "number" | "money" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
  textClassName?: string;
  autoFocus?: boolean;
  plain?: boolean;
}) {
  const draft = useDraft();
  const value = draft.values[k] ?? "";
  return (
    <InlineEdit
      {...props}
      value={value}
      display={value === draft.initial[k] ? display : undefined}
      onCommit={(next) => draft.set(k, next)}
    />
  );
}

export function DraftToggle({ k, label, hint, disabled }: { k: string; label: string; hint?: string; disabled?: boolean }) {
  const draft = useDraft();
  return (
    <ToggleField
      entity="product"
      id="draft"
      field={k}
      value={draft.values[k] === "true"}
      label={label}
      hint={hint}
      disabled={disabled}
      onToggle={(next) => draft.set(k, next ? "true" : "false")}
    />
  );
}

export function DraftDescription({ disabled }: { disabled?: boolean }) {
  const draft = useDraft();
  return (
    <RichText
      entity="product"
      id="draft"
      field="description"
      value={draft.values["product:description"] ?? ""}
      disabled={disabled}
      onChange={(html) => draft.set("product:description", html)}
    />
  );
}

export function DraftMedia() {
  const draft = useDraft();
  const tx = useTx();
  return (
    <div className="grid grid-cols-3 gap-3 px-5 pb-5 sm:grid-cols-4 md:grid-cols-5">
      {draft.files.map((image, index) => (
        <div key={image.url} className="group relative aspect-square overflow-hidden rounded-xl bg-subtle ring-1 ring-line">
          <img src={image.url} alt="" className="h-full w-full object-cover" />
          {index === 0 ? <span className="absolute left-1.5 top-1.5 rounded-md bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium text-muted">{tx("Cover")}</span> : null}
          <button type="button" onClick={() => draft.removeFile(index)} className="absolute right-1.5 top-1.5 rounded-md bg-surface/95 px-1.5 py-0.5 text-[11px] text-muted opacity-0 shadow-[var(--shadow-xs)] hover:text-danger group-hover:opacity-100" aria-label={tx("Remove")}>×</button>
        </div>
      ))}
      <div className={draft.files.length ? "" : "col-span-full"}>
        <ImageUpload compact={draft.files.length > 0} onFiles={draft.addFiles} />
      </div>
    </div>
  );
}

export function DraftSuppliers({ options }: { options: { id: string; name: string }[] }) {
  const draft = useDraft();
  const tx = useTx();
  const [pick, setPick] = useState("");
  const selected = options.filter((option) => draft.supplierIds.includes(option.id));
  const available = options.filter((option) => !draft.supplierIds.includes(option.id));
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-1.5 text-[13px] text-muted">{selected.length === 1 ? tx("Supplier") : tx("Suppliers")}</div>
      <ul className="space-y-1">
        {selected.map((supplier) => (
          <li key={supplier.id} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="truncate">{supplier.name}</span>
            <button type="button" onClick={() => draft.removeSupplier(supplier.id)} className="rounded px-1 text-[12px] text-faint hover:text-danger" aria-label={tx("Remove")}>×</button>
          </li>
        ))}
        {selected.length === 0 ? <li className="text-[13px] text-faint">{tx("No supplier yet")}</li> : null}
      </ul>
      {available.length ? (
        <div className="mt-2 flex items-center gap-2">
          <select value={pick} onChange={(event) => setPick(event.target.value)} aria-label={tx("Add supplier")} className="h-8 min-w-0 flex-1 rounded-md bg-surface px-2 text-[13px] text-muted outline-none ring-1 ring-line-strong">
            <option value="">{tx("Add supplier")}</option>
            {available.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
          <button type="button" onClick={() => { if (pick) { draft.addSupplier(pick); setPick(""); } }} className={buttonClass("secondary", "sm")}>{tx("Add")}</button>
        </div>
      ) : null}
    </div>
  );
}
