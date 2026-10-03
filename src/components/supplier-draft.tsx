"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SupplierBankInput, SupplierContactInput, SupplierPayload } from "@/server/actions/catalog";
import { InlineEdit } from "@/components/inline-edit";
import { buttonClass } from "@/components/ui";
import { useTx } from "@/lib/i18n-client";

type DraftApi = {
  values: Record<string, string>;
  set: (key: string, value: string) => void;
  contacts: SupplierContactInput[];
  setContact: (id: string, patch: Partial<SupplierContactInput>) => void;
  addContact: () => void;
  removeContact: (id: string) => void;
  banks: SupplierBankInput[];
  setBank: (id: string, patch: Partial<SupplierBankInput>) => void;
  addBank: () => void;
  removeBank: (id: string) => void;
  dirty: boolean;
  creating: boolean;
  error: string;
  pending: boolean;
  commit: () => void;
};

const DraftContext = createContext<DraftApi | null>(null);

function useDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("Supplier draft is missing.");
  return value;
}

function blankContact(): SupplierContactInput {
  return { id: `new-${crypto.randomUUID()}`, name: "", role: "", email: "", phone: "" };
}

function blankBank(): SupplierBankInput {
  return { id: `new-${crypto.randomUUID()}`, accountHolder: "", iban: "", bic: "", bankName: "" };
}

export function SupplierDraftProvider({
  mode,
  initial,
  contacts: initialContacts,
  banks: initialBanks,
  create,
  save,
  children,
}: {
  mode: "create" | "edit";
  initial: Record<string, string>;
  contacts: SupplierContactInput[];
  banks: SupplierBankInput[];
  create?: (payload: SupplierPayload) => Promise<{ error: string } | undefined | void>;
  save?: (payload: SupplierPayload) => Promise<{ ok: true } | { ok: false; error: string }>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [contacts, setContacts] = useState(initialContacts);
  const [banks, setBanks] = useState(initialBanks);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty =
    JSON.stringify(values) !== JSON.stringify(initial) ||
    JSON.stringify(contacts) !== JSON.stringify(initialContacts) ||
    JSON.stringify(banks) !== JSON.stringify(initialBanks);

  function payload(): SupplierPayload {
    return {
      name: values.name ?? "",
      code: values.code ?? "",
      customerNumber: values.customerNumber ?? "",
      email: values.email ?? "",
      phone: values.phone ?? "",
      website: values.website ?? "",
      street: values.street ?? "",
      postalCode: values.postalCode ?? "",
      city: values.city ?? "",
      country: values.country ?? "",
      language: values.language ?? "",
      currency: values.currency ?? "",
      vatId: values.vatId ?? "",
      taxNumber: values.taxNumber ?? "",
      notes: values.notes ?? "",
      leadTimeDays: values.leadTimeDays ?? "",
      paymentTerms: values.paymentTerms ?? "",
      contacts,
      bankAccounts: banks,
    };
  }

  function commit() {
    setError("");
    start(async () => {
      if (mode === "create") {
        const result = create ? await create(payload()) : undefined;
        if (result && "error" in result) setError(result.error);
        return;
      }
      if (!save) return;
      const result = await save(payload());
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const api: DraftApi = {
    values,
    set: (key, value) => setValues((current) => ({ ...current, [key]: value })),
    contacts,
    setContact: (id, patch) => setContacts((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row))),
    addContact: () => setContacts((current) => [...current, blankContact()]),
    removeContact: (id) => setContacts((current) => current.filter((row) => row.id !== id)),
    banks,
    setBank: (id, patch) => setBanks((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row))),
    addBank: () => setBanks((current) => [...current, blankBank()]),
    removeBank: (id) => setBanks((current) => current.filter((row) => row.id !== id)),
    dirty,
    creating: mode === "create",
    error,
    pending,
    commit,
  };

  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>;
}

export function SaveSupplierButton() {
  const draft = useDraft();
  const tx = useTx();
  const disabled = draft.pending || (!draft.creating && !draft.dirty);
  return (
    <button type="button" disabled={disabled} onClick={draft.commit} className={buttonClass("primary")}>
      {draft.pending ? tx(draft.creating ? "Creating" : "Saving") : tx(draft.creating ? "Create" : "Save")}
    </button>
  );
}

export function SupplierDraftNotice() {
  const draft = useDraft();
  const tx = useTx();
  if (!draft.error) return null;
  return <p className="mb-4 text-[13px] text-danger">{tx(draft.error)}</p>;
}

export function SupplierField({
  k,
  ...props
}: {
  k: string;
  entity: string;
  id: string;
  field: string;
  type?: "text" | "number" | "textarea" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  textClassName?: string;
  className?: string;
  autoFocus?: boolean;
  plain?: boolean;
}) {
  const draft = useDraft();
  return <InlineEdit {...props} value={draft.values[k] ?? ""} onCommit={(next) => draft.set(k, next)} />;
}

const cell = "h-8 w-full min-w-0 rounded-md bg-transparent px-2 text-[13px] outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-accent/30";

export function SupplierContacts() {
  const draft = useDraft();
  const tx = useTx();
  return (
    <div className="space-y-2">
      {draft.contacts.length === 0 ? <p className="text-[13px] text-muted">{tx("No contacts yet.")}</p> : null}
      {draft.contacts.map((contact) => (
        <div key={contact.id} className="grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_28px]">
          <input value={contact.name} onChange={(event) => draft.setContact(contact.id, { name: event.target.value })} placeholder={tx("Name")} aria-label={tx("Name")} className={cell} />
          <input value={contact.role} onChange={(event) => draft.setContact(contact.id, { role: event.target.value })} placeholder={tx("Role")} aria-label={tx("Role")} className={cell} />
          <input value={contact.email} onChange={(event) => draft.setContact(contact.id, { email: event.target.value })} placeholder={tx("Email")} aria-label={tx("Email")} className={cell} />
          <input value={contact.phone} onChange={(event) => draft.setContact(contact.id, { phone: event.target.value })} placeholder={tx("Phone")} aria-label={tx("Phone")} className={cell} />
          <button type="button" onClick={() => draft.removeContact(contact.id)} aria-label={tx("Remove")} className="h-8 text-[13px] text-faint hover:text-danger">{"\u00d7"}</button>
        </div>
      ))}
      <button type="button" onClick={draft.addContact} className={buttonClass("secondary", "sm")}>{tx("Add contact")}</button>
    </div>
  );
}

export function SupplierBanks() {
  const draft = useDraft();
  const tx = useTx();
  return (
    <div className="space-y-2">
      {draft.banks.length === 0 ? <p className="text-[13px] text-muted">{tx("No bank accounts yet.")}</p> : null}
      {draft.banks.map((account) => (
        <div key={account.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_28px]">
          <input value={account.accountHolder} onChange={(event) => draft.setBank(account.id, { accountHolder: event.target.value })} placeholder={tx("Account holder")} aria-label={tx("Account holder")} className={cell} />
          <input value={account.iban} onChange={(event) => draft.setBank(account.id, { iban: event.target.value })} placeholder={tx("IBAN")} aria-label={tx("IBAN")} className={`${cell} font-mono`} />
          <input value={account.bic} onChange={(event) => draft.setBank(account.id, { bic: event.target.value })} placeholder={tx("BIC")} aria-label={tx("BIC")} className={`${cell} font-mono`} />
          <input value={account.bankName} onChange={(event) => draft.setBank(account.id, { bankName: event.target.value })} placeholder={tx("Bank")} aria-label={tx("Bank")} className={cell} />
          <button type="button" onClick={() => draft.removeBank(account.id)} aria-label={tx("Remove")} className="h-8 text-[13px] text-faint hover:text-danger">{"\u00d7"}</button>
        </div>
      ))}
      <button type="button" onClick={draft.addBank} className={buttonClass("secondary", "sm")}>{tx("Add bank account")}</button>
    </div>
  );
}
