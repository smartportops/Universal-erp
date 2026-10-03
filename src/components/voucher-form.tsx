"use client";

import { useState } from "react";
import { useTx } from "@/lib/i18n-client";
import { accountNames, accountTypes } from "@/lib/labels";
import { createVoucher } from "@/server/actions/vouchers";
import { SubmitButton } from "@/components/submit-button";
import { Field, fieldClass } from "@/components/ui";

type Account = { id: string; code: string; name: string; type: string };
type Tax = { name: string; rateBps: number; isDefault: boolean };

export function VoucherForm({
  accounts,
  taxes,
  parties,
  today,
  defaults,
}: {
  accounts: Account[];
  taxes: Tax[];
  parties: string[];
  today: string;
  defaults: { in: { net: string; tax: string; contra: string }; out: { net: string; tax: string; contra: string } };
}) {
  const tx = useTx();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const picked = defaults[direction];
  const groups = ["expense", "revenue", "asset", "liability", "equity"].filter((type) => accounts.some((account) => account.type === type));
  const options = groups.map((type) => (
    <optgroup key={type} label={tx(accountTypes[type] ?? type)}>
      {accounts
        .filter((account) => account.type === type)
        .map((account) => (
          <option key={account.id} value={account.id}>
            {account.code} {tx(accountNames[account.code] ?? account.name)}
          </option>
        ))}
    </optgroup>
  ));
  return (
    <form action={createVoucher} className="grid gap-4 sm:grid-cols-2">
      <Field label={tx("Direction")}>
        <select name="direction" value={direction} onChange={(event) => setDirection(event.target.value === "out" ? "out" : "in")} className={fieldClass}>
          <option value="in">{tx("Incoming voucher")}</option>
          <option value="out">{tx("Outgoing voucher")}</option>
        </select>
      </Field>
      <Field label={tx("Date")}>
        <input type="date" name="issuedAt" required defaultValue={today} className={fieldClass} />
      </Field>
      <Field label={tx("Counterparty")}>
        <input name="counterparty" required list="parties" className={fieldClass} placeholder={tx("Supplier or customer")} />
        <datalist id="parties">
          {parties.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>
      <Field label={tx("Their reference")}>
        <input name="reference" className={fieldClass} placeholder={tx("Invoice number")} />
      </Field>
      <Field label={tx("Gross amount")} hint={tx("Tax is taken out of this amount at the rate below.")}>
        <input name="gross" required inputMode="decimal" placeholder="0,00" className={fieldClass} />
      </Field>
      <Field label={tx("Tax rate")}>
        <select name="taxRateBps" defaultValue={String(taxes.find((tax) => tax.isDefault)?.rateBps ?? taxes[0]?.rateBps ?? 0)} className={fieldClass}>
          {taxes.map((tax) => (
            <option key={`${tax.name}-${tax.rateBps}`} value={tax.rateBps}>
              {tax.name}
            </option>
          ))}
          {taxes.some((tax) => tax.rateBps === 0) ? null : <option value="0">{tx("No tax")}</option>}
        </select>
      </Field>
      <Field label={direction === "in" ? tx("Expense account") : tx("Revenue account")} hint={tx("Where the net amount is posted.")}>
        <select key={`${direction}-net`} name="netAccountId" defaultValue={picked.net} required className={fieldClass}>
          {options}
        </select>
      </Field>
      <Field label={tx("Tax account")} hint={direction === "in" ? tx("Input VAT, for example 1570.") : tx("Output VAT, for example 3800.")}>
        <select key={`${direction}-tax`} name="taxAccountId" defaultValue={picked.tax} className={fieldClass}>
          {options}
        </select>
      </Field>
      <Field label={tx("Contra account")} hint={tx("Payables or receivables, or the bank when it is already paid.")}>
        <select key={`${direction}-contra`} name="contraAccountId" defaultValue={picked.contra} required className={fieldClass}>
          {options}
        </select>
      </Field>
      <Field label={tx("Note")}>
        <input name="description" className={fieldClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label={tx("File")} hint={tx("PDF, image or XML, up to 8 MB. Optional.")}>
          <input name="file" type="file" accept="application/pdf,image/*,.xml,text/xml" className="block text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-subtle file:px-3 file:py-1.5 file:text-[13px] file:font-medium" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>{tx("Book voucher")}</SubmitButton>
      </div>
    </form>
  );
}
