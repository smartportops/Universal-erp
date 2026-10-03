import type { Language } from "./settings";

const locales: Record<Language, string> = { de: "de-DE", en: "en-GB" };

export function formatTime(date: Date, language: Language) {
  return new Intl.DateTimeFormat(locales[language], { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatLongDate(date: Date, language: Language) {
  return new Intl.DateTimeFormat(locales[language], { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatDay(value: string | Date | null | undefined, language: Language) {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locales[language], { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatWhen(value: string | Date | null | undefined, language: Language) {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locales[language], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatNumber(value: number, language: Language) {
  return new Intl.NumberFormat(locales[language]).format(value);
}

export function shortDay(value: string, language: Language) {
  return new Intl.DateTimeFormat(locales[language], { weekday: "short" }).format(new Date(value));
}

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}
