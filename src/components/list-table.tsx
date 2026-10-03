"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, Columns3, Download, Eye, EyeOff, GripVertical, MoreHorizontal, SquareCheck, X } from "lucide-react";
import { cn } from "@/lib/format";
import { useTx } from "@/lib/i18n-client";
import { runBulk, type BulkEntity } from "@/server/actions/bulk";
import { ClickRow } from "@/components/click-row";
import { EmptyState, buttonClass } from "@/components/ui";

export const PAGE_SIZE = 50;

export type ListColumn = { key: string; label: string; align?: "right"; className?: string };
export type ListRow = { key: string; href?: string; cells: Record<string, React.ReactNode> };
export type BulkAction = { key: string; label: string; tone?: "danger"; download?: boolean };

type Prefs = { order: string[]; hidden: string[] };

const listeners = new Set<() => void>();
const cache = new Map<string, Prefs | null>();

function readPrefs(id: string): Prefs | null {
  if (cache.has(id)) return cache.get(id) ?? null;
  try {
    const raw = localStorage.getItem(`aera_cols_${id}`);
    const parsed = raw ? (JSON.parse(raw) as Prefs) : null;
    cache.set(id, parsed);
    return parsed;
  } catch {
    cache.set(id, null);
    return null;
  }
}

function writePrefs(id: string, prefs: Prefs | null) {
  cache.set(id, prefs);
  try {
    if (prefs) localStorage.setItem(`aera_cols_${id}`, JSON.stringify(prefs));
    else localStorage.removeItem(`aera_cols_${id}`);
  } catch {}
  listeners.forEach((listener) => listener());
}

function usePrefs(id: string) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => readPrefs(id),
    () => null,
  );
}

export function ListTable({
  id,
  columns,
  rows,
  total,
  page,
  exportHref,
  bulk,
  empty,
}: {
  id: string;
  columns: ListColumn[];
  rows: ListRow[];
  total: number;
  page: number;
  exportHref?: string;
  bulk?: { entity: BulkEntity; actions: BulkAction[]; allIds: string[] };
  empty?: { title: string; body: string; action?: React.ReactNode };
}) {
  const tx = useTx();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const prefs = usePrefs(id);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const downloadForm = useRef<HTMLFormElement>(null);

  const visible = useMemo(() => {
    const order = prefs?.order?.length ? prefs.order : columns.map((column) => column.key);
    const hidden = new Set(prefs?.hidden ?? []);
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const ordered = order.map((key) => byKey.get(key)).filter((column): column is ListColumn => !!column);
    for (const column of columns) if (!ordered.includes(column)) ordered.push(column);
    return ordered.filter((column) => !hidden.has(column.key));
  }, [columns, prefs]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (next: number) => {
    const copy = new URLSearchParams(params.toString());
    if (next <= 1) copy.delete("page");
    else copy.set("page", String(next));
    const query = copy.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const scope = `${page}|${params.toString()}`;
  const [seenScope, setSeenScope] = useState(scope);
  if (seenScope !== scope) {
    setSeenScope(scope);
    setSelected(new Set());
    setAll(false);
  }

  const pageIds = rows.map((row) => row.key);
  const pageAllChecked = pageIds.length > 0 && pageIds.every((key) => selected.has(key));
  const count = all ? bulk?.allIds.length ?? 0 : selected.size;

  function togglePage() {
    setAll(false);
    setSelected((current) => {
      const next = new Set(current);
      if (pageAllChecked) pageIds.forEach((key) => next.delete(key));
      else pageIds.forEach((key) => next.add(key));
      return next;
    });
  }

  function toggleOne(key: string) {
    setAll(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function leaveSelection() {
    setSelecting(false);
    setSelected(new Set());
    setAll(false);
  }

  function run(action: BulkAction) {
    if (!bulk) return;
    const ids = all ? bulk.allIds : [...selected];
    if (ids.length === 0) return;
    if (action.download) {
      const form = downloadForm.current;
      if (!form) return;
      form.innerHTML = "";
      const add = (name: string, value: string) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      };
      add("entity", bulk.entity);
      add("action", action.key);
      ids.forEach((value) => add("ids", value));
      form.submit();
      return;
    }
    if (action.tone === "danger" && !window.confirm(tx("{n} records: {action}?", { n: ids.length, action: action.label }))) return;
    const returnTo = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    startTransition(async () => {
      await runBulk({ entity: bulk.entity, action: action.key, ids, returnTo });
      leaveSelection();
      router.refresh();
    });
  }

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(total, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        {selecting ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium tabular-nums">{tx("{n} selected", { n: count })}</span>
            {bulk && !all && total > selected.size && selected.size > 0 ? (
              <button type="button" className="text-accent hover:underline" onClick={() => setAll(true)}>
                {tx("Select all {n}", { n: bulk.allIds.length })}
              </button>
            ) : null}
            {all ? <button type="button" className="text-muted hover:underline" onClick={() => setAll(false)}>{tx("Only this page")}</button> : null}
            {bulk ? <ActionMenu actions={bulk.actions} disabled={count === 0 || pending} onPick={run} /> : null}
            <button type="button" className={buttonClass("ghost", "sm")} onClick={leaveSelection}>
              <X size={13} /> {tx("Done")}
            </button>
          </div>
        ) : (
          <div className="text-[12px] text-muted tabular-nums">{total === 0 ? tx("No records") : tx("{start}–{end} of {total}", { start, end, total })}</div>
        )}
        <div className="flex items-center gap-1.5">
          {bulk && !selecting && rows.length > 0 ? (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setSelecting(true)}>
              <SquareCheck size={13} /> {tx("Select")}
            </button>
          ) : null}
          <ColumnsMenu id={id} columns={columns} prefs={prefs} />
          {exportHref ? (
            <a href={exportHref} className={buttonClass("secondary", "sm")}>
              <Download size={13} /> {tx("Export")}
            </a>
          ) : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={empty?.title ?? tx("Nothing to show")} body={empty?.body ?? tx("Change the filters or create a new record.")} action={empty?.action} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-line bg-subtle text-left text-[12px] text-muted">
                {selecting ? (
                  <th className="w-10 py-2 pl-5">
                    <input type="checkbox" checked={pageAllChecked} onChange={togglePage} aria-label={tx("Select page")} className="align-middle accent-accent" />
                  </th>
                ) : null}
                {visible.map((column, index) => (
                  <th key={column.key} className={cn("px-3 py-2 font-medium", index === 0 && !selecting && "pl-5", index === visible.length - 1 && "pr-5", column.align === "right" && "text-right", column.className)}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const checked = all || selected.has(row.key);
                return (
                  <ClickRow key={row.key} href={selecting ? undefined : row.href} className={cn("group border-b border-line last:border-0", row.href && !selecting && "hover:bg-subtle", checked && "bg-soft/40")}>
                    {selecting ? (
                      <td className="w-10 py-3 pl-5">
                        <input type="checkbox" checked={checked} onChange={() => toggleOne(row.key)} aria-label={tx("Select")} className="align-middle accent-accent" />
                      </td>
                    ) : null}
                    {visible.map((column, index) => (
                      <td key={column.key} className={cn("px-3 py-3 align-middle", index === 0 && !selecting && "pl-5", index === visible.length - 1 && "pr-5", column.align === "right" && "text-right tabular-nums", column.className)}>
                        {index === 0 && row.href && !selecting ? <Link href={row.href} className="font-medium">{row.cells[column.key]}</Link> : row.cells[column.key]}
                      </td>
                    ))}
                  </ClickRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12px] text-muted">
          <span className="tabular-nums">{tx("Page {page} of {pages}", { page, pages })}</span>
          <span className="flex items-center gap-1">
            <Link aria-disabled={page <= 1} href={pageHref(page - 1)} className={cn(buttonClass("secondary", "sm"), page <= 1 && "pointer-events-none opacity-40")}>
              <ChevronLeft size={13} /> {tx("Previous")}
            </Link>
            <Link aria-disabled={page >= pages} href={pageHref(page + 1)} className={cn(buttonClass("secondary", "sm"), page >= pages && "pointer-events-none opacity-40")}>
              {tx("Next")} <ChevronRight size={13} />
            </Link>
          </span>
        </div>
      ) : null}
      <form ref={downloadForm} method="post" action="/api/bulk" target={`${id}-download`} className="hidden" />
      <iframe name={`${id}-download`} title="download" className="hidden" />
    </div>
  );
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handle(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) close();
    }
    window.addEventListener("mousedown", handle);
    return () => window.removeEventListener("mousedown", handle);
  }, [open, close]);
  return ref;
}

function ActionMenu({ actions, disabled, onPick }: { actions: BulkAction[]; disabled: boolean; onPick: (action: BulkAction) => void }) {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={buttonClass("primary", "sm")} disabled={disabled} onClick={() => setOpen((value) => !value)} aria-label={tx("Actions")}>
        <MoreHorizontal size={14} /> {tx("Actions")}
      </button>
      {open ? (
        <div className="absolute left-0 z-30 mt-1.5 w-60 overflow-hidden rounded-xl bg-surface py-1 shadow-[var(--shadow-lg)] ring-1 ring-line">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-subtle", action.tone === "danger" && "text-danger")}
              onClick={() => {
                setOpen(false);
                onPick(action);
              }}
            >
              {action.download ? <Download size={13} /> : <span className="inline-block w-[13px]" />}
              {tx(action.label)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColumnsMenu({ id, columns, prefs }: { id: string; columns: ListColumn[]; prefs: Prefs | null }) {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const ref = useClickOutside(open, () => setOpen(false));
  const order = useMemo(() => {
    const base = prefs?.order?.length ? prefs.order : columns.map((column) => column.key);
    const known = new Set(columns.map((column) => column.key));
    const list = base.filter((key) => known.has(key));
    for (const column of columns) if (!list.includes(column.key)) list.push(column.key);
    return list;
  }, [columns, prefs]);
  const hidden = new Set(prefs?.hidden ?? []);
  const byKey = new Map(columns.map((column) => [column.key, column]));

  function save(nextOrder: string[], nextHidden: Set<string>) {
    writePrefs(id, { order: nextOrder, hidden: [...nextHidden] });
  }

  function move(from: string, to: string) {
    if (from === to) return;
    const next = order.filter((key) => key !== from);
    next.splice(next.indexOf(to), 0, from);
    save(next, hidden);
  }

  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else if (order.length - next.size > 1) next.add(key);
    save(order, next);
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen((value) => !value)}>
        <Columns3 size={13} /> {tx("Columns")}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-lg)] ring-1 ring-line">
          <div className="flex items-center justify-between px-3 pb-1 pt-2.5 text-[12px] text-muted">
            <span>{tx("Drag to reorder")}</span>
            {prefs ? <button type="button" className="text-accent hover:underline" onClick={() => writePrefs(id, null)}>{tx("Reset")}</button> : null}
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {order.map((key) => {
              const column = byKey.get(key);
              if (!column) return null;
              const off = hidden.has(key);
              return (
                <li
                  key={key}
                  draggable
                  onDragStart={() => setDragging(key)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragging) move(dragging, key);
                    setDragging(null);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cn("flex items-center gap-2 px-2 py-1.5 text-[13px]", dragging === key && "opacity-40")}
                >
                  <GripVertical size={14} className="shrink-0 cursor-grab text-faint" />
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggle(key)}>
                    <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", off ? "border-line-strong" : "border-accent bg-accent text-white")}>{off ? null : <Check size={11} strokeWidth={3} />}</span>
                    <span className={cn("truncate", off && "text-muted")}>{column.label}</span>
                  </button>
                  {off ? <EyeOff size={13} className="text-faint" /> : <Eye size={13} className="text-faint" />}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
