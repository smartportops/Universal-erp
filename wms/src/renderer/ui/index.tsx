import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Barcode, Check, Minus, Plus, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/format";
import { useT } from "@/lib/i18n";

/* ---- Buttons ----------------------------------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong active:bg-accent-strong shadow-sm",
  secondary: "bg-white text-ink border border-line hover:bg-surface active:bg-line",
  ghost: "bg-transparent text-ink hover:bg-black/5 active:bg-black/10",
  danger: "bg-danger text-white hover:bg-red-700 active:bg-red-800",
  dark: "bg-ink text-white hover:bg-black active:bg-black",
};

const sizes: Record<Size, string> = {
  md: "h-12 px-4 text-[15px] rounded-xl gap-2",
  lg: "h-14 px-5 text-[16px] rounded-xl gap-2.5",
  xl: "h-20 px-6 text-[18px] rounded-2xl gap-3",
};

export type BigButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  hint?: string;
  block?: boolean;
};

export const BigButton = forwardRef<HTMLButtonElement, BigButtonProps>(function BigButton(
  { variant = "secondary", size = "lg", icon: Icon, hint, block, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
    >
      {Icon ? <Icon className={cn(size === "xl" ? "size-6" : "size-5", "shrink-0")} strokeWidth={2.2} /> : null}
      <span className="truncate">{children}</span>
      {hint ? <KeyHint dark={variant === "primary" || variant === "danger" || variant === "dark"}>{hint}</KeyHint> : null}
    </button>
  );
});

export function KeyHint({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={cn(
        "ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-semibold",
        dark ? "bg-white/20 text-white" : "bg-ink/8 text-muted",
      )}
    >
      {children}
    </kbd>
  );
}

/* ---- Panels ------------------------------------------------------------ */

export function Panel({
  title,
  description,
  actions,
  children,
  flush,
  className,
  tone = "light",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      {title || actions ? (
        <header className={cn("flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5", tone === "dark" && "bg-ink text-white border-ink")}>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>
            {description ? <p className={cn("truncate text-[12.5px]", tone === "dark" ? "text-white/60" : "text-muted")}>{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("min-h-0 flex-1", flush ? "overflow-auto" : "overflow-auto p-5")}>{children}</div>
    </section>
  );
}

/* ---- Form -------------------------------------------------------------- */

export const inputClass =
  "h-14 w-full rounded-xl border border-line bg-white px-4 text-[16px] text-ink outline-none transition-shadow placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/15 disabled:bg-surface disabled:text-muted";

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-faint">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cn(inputClass, className)} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(inputClass, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[position:right_16px_center] bg-no-repeat pr-11", className)}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-line bg-white px-4 text-left">
      <span className="text-[15px] font-medium">{label}</span>
      <span className={cn("relative inline-flex h-8 w-14 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line")}>
        <span className={cn("absolute top-1 size-6 rounded-full bg-white shadow transition-transform", checked ? "translate-x-7" : "translate-x-1")} />
      </span>
    </button>
  );
}

/** Big scan field. Submits on Enter/Tab, keeps focus, clears itself. */
export function ScanInput({
  onScan,
  placeholder,
  autoFocus = true,
  disabled,
  className,
}: {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const t = useT();
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = () => {
    const code = value.trim();
    if (code) onScan(code);
    setValue("");
  };
  return (
    <div className={cn("relative", className)}>
      <Barcode className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-faint" />
      <input
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder ?? t("Scan barcode or type SKU")}
        autoComplete="off"
        spellCheck={false}
        className={cn(inputClass, "h-16 pl-13 pr-14 font-mono text-[18px]")}
      />
      {value ? (
        <button type="button" onClick={() => setValue("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:bg-surface">
          <X className="size-5" />
        </button>
      ) : null}
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 0, max, size = "md" }: { value: number; onChange: (next: number) => void; min?: number; max?: number; size?: "md" | "lg" }) {
  const clamp = (n: number) => Math.max(min, max !== undefined ? Math.min(max, n) : n);
  const h = size === "lg" ? "h-14" : "h-12";
  return (
    <div className={cn("inline-flex items-stretch overflow-hidden rounded-xl border border-line bg-white", h)}>
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} className="flex w-12 items-center justify-center text-ink hover:bg-surface disabled:opacity-30">
        <Minus className="size-5" />
      </button>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value) || 0))}
        className="w-16 border-x border-line text-center font-mono text-[17px] font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={max !== undefined && value >= max} className="flex w-12 items-center justify-center text-ink hover:bg-surface disabled:opacity-30">
        <Plus className="size-5" />
      </button>
    </div>
  );
}

/* ---- Status & text ----------------------------------------------------- */

type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "dark";

const tones: Record<Tone, string> = {
  neutral: "bg-surface text-muted",
  ok: "bg-accent-soft text-accent-strong",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  dark: "bg-ink text-white",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-7 items-center whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold", tones[tone], className)}>{children}</span>;
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "confirmed":
    case "open":
    case "ordered":
      return "info";
    case "picking":
    case "partial":
      return "warn";
    case "picked":
    case "shipped":
    case "received":
    case "delivered":
      return "ok";
    case "cancelled":
    case "hold":
      return "danger";
    default:
      return "neutral";
  }
}

export function Stat({ label, value, sub, tone = "neutral", icon: Icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: LucideIcon }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {Icon ? (
          <span className={cn("flex size-9 items-center justify-center rounded-lg", tones[tone])}>
            <Icon className="size-5" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-[32px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      {sub ? <div className="mt-2 text-[12.5px] text-faint">{sub}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      {Icon ? <Icon className="mb-3 size-10 text-faint" strokeWidth={1.5} /> : null}
      <div className="text-[16px] font-semibold">{title}</div>
      {body ? <p className="mt-1 max-w-sm text-[14px] text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Progress({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-accent" : "bg-info")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Done({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-7 items-center justify-center rounded-full bg-accent text-white", className)}>
      <Check className="size-4" strokeWidth={3} />
    </span>
  );
}

/* ---- Tables ------------------------------------------------------------ */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn("w-full border-collapse text-[15px]", className)}>{children}</table>;
}

export function Th({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string }) {
  return (
    <th className={cn("sticky top-0 z-10 whitespace-nowrap border-b border-line bg-panel px-4 py-3 text-[12.5px] font-semibold uppercase tracking-wide text-muted", `text-${align}`, className)}>
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className, mono }: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string; mono?: boolean }) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", `text-${align}`, mono && "font-mono text-[14px]", className)}>{children}</td>;
}

/* ---- Bars -------------------------------------------------------------- */

export function Bars({ data, color = "bg-accent" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-[12px] font-semibold tabular-nums text-muted">{d.value}</span>
          <div className="relative h-32 w-full rounded-md bg-surface">
            <div className={cn("absolute inset-x-0 bottom-0 rounded-md transition-all", color)} style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
          </div>
          <span className="text-[12px] text-faint">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- Modal ------------------------------------------------------------- */

export function Modal({ open, title, children, onClose, footer, width = "max-w-xl" }: { open: boolean; title: ReactNode; children: ReactNode; onClose: () => void; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onMouseDown={onClose}>
      <div className={cn("fade-in flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl", width)} onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-6">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface">
            <X className="size-6" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-6">{children}</div>
        {footer ? <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-line px-6 py-4">{footer}</footer> : null}
      </div>
    </div>
  );
}

/* ---- Notice ------------------------------------------------------------ */

export function Notice({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl px-4 py-3 text-[14px] font-medium", tones[tone], className)}>{children}</div>;
}
