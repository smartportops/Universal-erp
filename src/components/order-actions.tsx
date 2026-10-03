"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Check, ChevronDown, FileText, PauseCircle, Printer, Receipt, Wallet } from "lucide-react";
import { useTx } from "@/lib/i18n-client";
import { buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { payInvoice } from "@/server/actions/finance";
import { cancelOrder, completeOrder, createQuote, holdOrder, setPriority } from "@/server/actions/orders";
import { issueInvoiceAction } from "@/server/actions/finance";
import { fieldClass } from "@/components/ui";

type InvoiceRef = { id: string; number: string; openCents: number; openInput: string };

export function OrderActions({
  id,
  status,
  priority,
  onHold,
  canSales,
  canFinance,
  canInvoice,
  invoice,
}: {
  id: string;
  status: string;
  priority: string;
  onHold: boolean;
  canSales: boolean;
  canFinance: boolean;
  canInvoice: boolean;
  invoice: InvoiceRef | null;
}) {
  const tx = useTx();
  const closed = status === "cancelled" || status === "completed";
  const priorities = [
    ["low", "Low"],
    ["normal", "Normal"],
    ["high", "High"],
    ["urgent", "Urgent"],
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSales && status !== "cancelled" && status !== "completed" ? (
        <form action={cancelOrder}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="danger" className="ring-danger/40">{tx("Cancel order")}</SubmitButton>
        </form>
      ) : null}
      {canSales && status !== "cancelled" ? (
        <Menu label={tx(priorities.find(([key]) => key === priority)?.[1] ?? "Normal")} icon={<ArrowUpDown size={14} />}>
          {priorities.map(([key, label]) => (
            <form key={key} action={setPriority}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="priority" value={key} />
              <MenuButton active={priority === key}>{tx(label)}</MenuButton>
            </form>
          ))}
        </Menu>
      ) : null}
      {canSales && !closed ? (
        <Menu label={onHold ? tx("On hold") : tx("Put on hold")} icon={<PauseCircle size={14} />}>
          <form action={holdOrder}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="hold" value={onHold ? "0" : "1"} />
            <MenuButton>{onHold ? tx("Release") : tx("Put on hold")}</MenuButton>
          </form>
        </Menu>
      ) : null}
      <Menu label={tx("More actions")}>
        {canFinance && invoice && invoice.openCents > 0 ? (
          <PaymentForm invoice={invoice} />
        ) : (
          <DisabledRow icon={<Wallet size={14} />} label={tx("Record payment")} hint={invoice ? tx("Nothing open.") : tx("Create an invoice first.")} />
        )}
        {canInvoice ? (
          <form action={issueInvoiceAction}>
            <input type="hidden" name="id" value={id} />
            <MenuButton icon={<Receipt size={14} />}>{tx("Create invoice")}</MenuButton>
          </form>
        ) : invoice ? (
          <Link href={`/invoices/${invoice.id}`} className={itemClass}><Receipt size={14} /> {tx("Open invoice")}</Link>
        ) : (
          <DisabledRow icon={<Receipt size={14} />} label={tx("Create invoice")} hint={tx("Not available for this order.")} />
        )}
        {canSales && status !== "cancelled" ? (
          <form action={createQuote}>
            <input type="hidden" name="id" value={id} />
            <MenuButton icon={<FileText size={14} />}>{tx("Create quote")}</MenuButton>
          </form>
        ) : null}
        <a href={`/api/sales-orders/${id}/delivery-note`} className={itemClass}><Printer size={14} /> {tx("Print delivery note")}</a>
        {canSales && !closed ? (
          <form action={completeOrder}>
            <input type="hidden" name="id" value={id} />
            <MenuButton icon={<Check size={14} />}>{tx("Mark as completed")}</MenuButton>
          </form>
        ) : null}
      </Menu>
    </div>
  );
}

const itemClass = "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-subtle";

function Menu({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={buttonClass("secondary")} onClick={() => setOpen((value) => !value)}>
        {icon}
        {label}
        <ChevronDown size={13} className="text-muted" />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl bg-surface py-1 shadow-[var(--shadow-lg)] ring-1 ring-line">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({ children, icon, active }: { children: React.ReactNode; icon?: React.ReactNode; active?: boolean }) {
  return (
    <button type="submit" className={itemClass}>
      {icon ?? (active ? <Check size={14} /> : <span className="inline-block w-3.5" />)}
      <span className="flex-1">{children}</span>
    </button>
  );
}

function DisabledRow({ icon, label, hint }: { icon: React.ReactNode; label: string; hint: string }) {
  return (
    <div className="px-3 py-2 text-[13px] text-faint">
      <div className="flex items-center gap-2">{icon} {label}</div>
      <div className="pl-6 text-[12px]">{hint}</div>
    </div>
  );
}

function PaymentForm({ invoice }: { invoice: InvoiceRef }) {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className={itemClass} onClick={() => setOpen(true)}>
        <Wallet size={14} /> {tx("Record payment")}
      </button>
    );
  }
  return (
    <form action={payInvoice} className="space-y-2 px-3 py-2" onMouseDown={(event) => event.stopPropagation()}>
      <input type="hidden" name="id" value={invoice.id} />
      <div className="text-[12px] font-medium">{tx("Record payment")} · {invoice.number}</div>
      <input name="amount" required defaultValue={invoice.openInput} className={`${fieldClass} text-right`} aria-label={tx("Amount")} />
      <select name="method" defaultValue="bank" className={fieldClass} aria-label={tx("Payment method")}>
        <option value="bank">{tx("Bank transfer")}</option>
        <option value="card">{tx("Card")}</option>
        <option value="paypal">{tx("PayPal")}</option>
        <option value="manual">{tx("Manual")}</option>
      </select>
      <input name="reference" placeholder={tx("Reference (optional)")} className={fieldClass} />
      <SubmitButton className="w-full">{tx("Post payment")}</SubmitButton>
    </form>
  );
}
