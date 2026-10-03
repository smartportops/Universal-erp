import Link from "next/link";
import { ClickRow } from "@/components/click-row";
import { T } from "@/lib/i18n-client";
import { ChevronLeft } from "lucide-react";
import { tone, type Tone } from "@/lib/labels";
import { cn } from "@/lib/format";

export function PageIntro({
  back,
  eyebrow,
  title,
  badges,
  description,
  actions,
  thumb,
}: {
  back?: { href: string; label: string };
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  badges?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  thumb?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {back ? (
        <Link href={back.href} className="-ml-1 mb-3 inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[13px] text-muted hover:bg-ink/[0.04] hover:text-ink">
          <ChevronLeft size={14} strokeWidth={2} />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {thumb}
          <div className="min-w-0">
            {eyebrow ? <div className="mb-0.5 text-[13px] text-muted">{eyebrow}</div> : null}
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="min-w-0 text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
              {badges}
            </div>
            {description ? <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

const buttonStyles = {
  primary: "bg-primary text-primary-ink shadow-[var(--shadow-xs)] hover:bg-[#2a2a30]",
  accent: "bg-accent text-accent-ink shadow-[var(--shadow-xs)] hover:bg-[#4338ca]",
  secondary: "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line-strong hover:bg-subtle",
  ghost: "text-muted hover:bg-ink/[0.04] hover:text-ink",
  danger: "bg-surface text-danger ring-1 ring-line-strong hover:bg-danger-soft",
};

export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
    buttonStyles[variant],
  );
}

export function Button({
  href,
  variant = "primary",
  size = "md",
  children,
  className,
  ...props
}: {
  href?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  children: React.ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = cn(buttonClass(variant, size), className);
  if (href) return <Link href={href} className={classes}>{children}</Link>;
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function Banner({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <div
      className={cn(
        "mb-5 flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] ring-1",
        error ? "bg-danger-soft text-danger ring-danger/15" : "bg-ok-soft text-ok ring-ok/15",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", error ? "bg-danger" : "bg-ok")} />
      <T text={error || notice || ""} />
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  flush,
}: {
  title?: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl bg-surface shadow-[var(--shadow)]", className)}>
      {title || action ? (
        <header className={cn("flex items-center justify-between gap-3 px-5 pt-4", flush ? "pb-3" : "pb-1")}>
          <div className="min-w-0">
            {title ? <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[12px] text-muted">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={flush ? "" : "px-5 pb-5 pt-3"}>{children}</div>
    </section>
  );
}

export function Status({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const item = tone(map, value);
  return <Pill tone={item.tone}>{item.label}</Pill>;
}

const pillStyles: Record<Tone, { box: string; dot: string }> = {
  neutral: { box: "bg-ink/[0.05] text-muted", dot: "bg-faint" },
  ok: { box: "bg-ok-soft text-ok", dot: "bg-[#17b26a]" },
  warning: { box: "bg-warning-soft text-warning", dot: "bg-[#f79009]" },
  danger: { box: "bg-danger-soft text-danger", dot: "bg-danger" },
  info: { box: "bg-info-soft text-info", dot: "bg-[#2e90fa]" },
};

export function Pill({ tone: kind = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const style = pillStyles[kind];
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full pl-2 pr-2.5 text-[12px] font-medium", style.box)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {children}
    </span>
  );
}

export function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[12px] text-muted">{item.label}</dt>
          <dd className="mt-1 truncate text-[14px]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Properties({ items }: { items: { label: string; value: React.ReactNode; hidden?: boolean }[] }) {
  return (
    <dl className="space-y-0.5">
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <div key={item.label} className="grid min-h-8 grid-cols-[104px_minmax(0,1fr)] items-center gap-3">
            <dt className="text-[13px] text-muted">{item.label}</dt>
            <dd className="min-w-0 text-[13px]">{item.value}</dd>
          </div>
        ))}
    </dl>
  );
}

const thumbColors = [
  ["#eef0ff", "#4f46e5"],
  ["#ecfdf3", "#067647"],
  ["#fff4ed", "#c4320a"],
  ["#fdf2fa", "#c11574"],
  ["#eff8ff", "#175cd3"],
  ["#fefbe8", "#a15c07"],
  ["#f4f3ff", "#6927da"],
  ["#f0fdf9", "#107569"],
];

export function Thumb({ label, size = 36, className }: { label: string; size?: number; className?: string }) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [bg, fg] = thumbColors[hash % thumbColors.length];
  const initials = label
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-lg font-semibold ring-1 ring-black/[0.04]", className)}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.34) }}
    >
      {initials}
    </span>
  );
}

export function Tabs({ items }: { items: { href: string; label: string; active?: boolean; count?: number }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1">
      {items.map((item) => (
        <Link
          key={item.href + item.label}
          href={item.href}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
            item.active ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
          )}
        >
          {item.label}
          {item.count != null ? (
            <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", item.active ? "bg-ink/[0.06] text-ink" : "bg-ink/[0.05] text-muted")}>{item.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[#f2f2f5] text-faint">
        <span className="h-3 w-3 rounded-[4px] border-2 border-current" />
      </div>
      <p className="text-[14px] font-medium">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: { label: string; align?: "right"; className?: string }[];
  rows: { key: string; href?: string; cells: React.ReactNode[]; select?: string; tone?: "danger" }[];
  empty?: { title: string; body: string; action?: React.ReactNode };
}) {
  if (rows.length === 0) {
    return <EmptyState title={empty?.title ?? "Nothing to show"} body={empty?.body ?? "Change the filters or create a new record."} action={empty?.action} />;
  }
  const selectable = rows.some((row) => row.select);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-y border-line bg-subtle text-left text-[12px] text-muted">
            {selectable ? <th className="w-10 py-2 pl-5" /> : null}
            {columns.map((column, index) => (
              <th
                key={column.label + index}
                className={cn(
                  "px-3 py-2 font-medium",
                  index === 0 && !selectable && "pl-5",
                  index === columns.length - 1 && "pr-5",
                  column.align === "right" && "text-right",
                  column.className,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ClickRow key={row.key} href={row.href} className={cn("group border-b border-line last:border-0", row.href && "hover:bg-subtle")}>
              {row.select ? (
                <td className="w-10 py-3 pl-5">
                  <input type="checkbox" name="ids" value={row.select} aria-label="Select" className="align-middle" />
                </td>
              ) : selectable ? <td /> : null}
              {row.cells.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    "px-3 py-3 align-middle",
                    index === 0 && !selectable && "pl-5",
                    index === row.cells.length - 1 && "pr-5",
                    columns[index]?.align === "right" && "text-right tabular-nums",
                    columns[index]?.className,
                  )}
                >
                  {index === 0 && row.href ? (
                    <Link href={row.href} className="font-medium">
                      {cell}
                    </Link>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </ClickRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const fieldClass =
  "h-9 w-full rounded-lg bg-surface px-3 text-[13px] shadow-[var(--shadow-xs)] outline-none ring-1 ring-line-strong transition placeholder:text-faint focus:ring-2 focus:ring-accent/40 disabled:bg-subtle disabled:text-muted";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function Stat({ label, value, hint, href, tone: kind }: { label: string; value: string; hint?: string; href?: string; tone?: Tone }) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[13px] text-muted">
        {kind && kind !== "neutral" ? <span className={cn("h-1.5 w-1.5 rounded-full", pillStyles[kind].dot)} /> : null}
        {label}
      </div>
      <div className="mt-1.5 text-[26px] font-semibold tracking-[-0.03em] tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-[12px] text-faint">{hint}</div> : null}
    </>
  );
  const classes = "block rounded-xl bg-surface px-5 py-4 shadow-[var(--shadow)]";
  if (href) return <Link href={href} className={cn(classes, "transition hover:shadow-[var(--shadow-lg)]")}>{body}</Link>;
  return <div className={classes}>{body}</div>;
}

export function selectClass() {
  return fieldClass;
}
