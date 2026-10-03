import { one } from "@/lib/format";

export const PAGE_SIZE = 50;

type Query = Record<string, string | string[] | undefined>;

/** Slice a filtered list for the current page (50 per page) and return what the ListTable needs. */
export function paginate<T>(items: T[], query: Query) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number(one(query.page) || 1);
  const page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1));
  return { page, total, rows: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

/** Export link that carries the current filters along. */
export function exportHref(entity: string, query: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const text = one(value);
    if (text && !["page", "notice", "error"].includes(key)) params.set(key, text);
  }
  const text = params.toString();
  return `/api/export/${entity}${text ? `?${text}` : ""}`;
}
