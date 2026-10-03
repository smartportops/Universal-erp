import { Field, Tabs, buttonClass, fieldClass } from "@/components/ui";

type Tx = (text: string, vars?: Record<string, string | number>) => string;

export function FinanceTabs({ active, tx }: { active: "vouchers" | "journal" | "accounts" | "vat" | "statements"; tx: Tx }) {
  const item = (key: typeof active, href: string, label: string) => ({ href, label: tx(label), active: active === key });
  return (
    <Tabs
      items={[
        item("vouchers", "/vouchers", "Vouchers"),
        item("journal", "/bookkeeping", "Journal"),
        item("accounts", "/bookkeeping/accounts", "Accounts"),
        item("vat", "/bookkeeping/vat", "VAT return"),
        item("statements", "/bookkeeping/statements", "Annual accounts"),
      ]}
    />
  );
}

export function ReportRange({
  action,
  year,
  years,
  period,
  locale,
  tx,
}: {
  action: string;
  year: number;
  years: number[];
  period?: string;
  locale: string;
  tx: (text: string, vars?: Record<string, string | number>) => string;
}) {
  const months = period !== undefined;
  const monthName = (index: number) =>
    new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, index, 1)));
  return (
    <form action={action} className="mb-4 flex flex-wrap items-end gap-2">
      <Field label={tx("Year")}>
        <select name="year" defaultValue={String(year)} className={`${fieldClass} w-auto`}>
          {years.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </Field>
      {months ? (
        <Field label={tx("Period")}>
          <select name="period" defaultValue={period} className={`${fieldClass} w-auto`}>
            <option value="y">{tx("Full year")}</option>
            {[1, 2, 3, 4].map((quarter) => (
              <option key={quarter} value={`q${quarter}`}>{tx("Quarter {n}", { n: quarter })}</option>
            ))}
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={`m${index + 1}`}>{monthName(index)}</option>
            ))}
          </select>
        </Field>
      ) : null}
      <button className={`${buttonClass("secondary")} mb-0`} type="submit">{tx("Show")}</button>
    </form>
  );
}
