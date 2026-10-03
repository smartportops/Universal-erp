import { dictionary } from "@/i18n/dictionary";
import { translate } from "@/lib/i18n";

export function money(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function qty(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

export function signedQty(value: number) {
  const formatted = qty(value);
  return value > 0 ? `+${formatted}` : formatted;
}

export function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayKey() {
  return dayKey(new Date());
}

export function daysFromToday(days: number) {
  const [year, month, day] = todayKey().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
}

export function formatDay(date: Date | string | null | undefined) {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(value);
}

export function formatWhen(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(value);
}

export function relativeDay(date: Date | string | null | undefined, locale: "en" | "de" = "en") {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  const diff = Math.round(
    (Date.parse(todayKey()) - Date.parse(dayKey(value))) / 86_400_000,
  );
  const tx = (text: string, vars?: Record<string, string | number>) => translate(locale, text, dictionary, vars);
  if (diff === 0) return tx("today");
  if (diff === 1) return tx("yesterday");
  if (diff === -1) return tx("tomorrow");
  if (diff > 1) return tx("{n} days ago", { n: diff });
  return tx("in {n} days", { n: -diff });
}

export function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T12:00:00.000Z`);
}

export function toDateInput(date: Date | null | undefined) {
  if (!date) return "";
  return dayKey(date);
}

export function parseMoneyToCents(value: string) {
  const raw = value.trim().replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function splitGross(grossCents: number, rateBps: number) {
  const net = Math.round((grossCents * 10_000) / (10_000 + rateBps));
  return { net, tax: grossCents - net, gross: grossCents };
}

export function one(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
