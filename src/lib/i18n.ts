export type Locale = "en" | "de";
export type Theme = "light" | "dark";

export function translate(locale: Locale, text: string, dictionary: Record<string, string>, vars?: Record<string, string | number>) {
  const reverse = reverseOf(dictionary);
  let out = locale === "de" ? (dictionary[text] ?? text) : (reverse.get(text) ?? text);
  if (vars) {
    for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

const reverseCache = new WeakMap<Record<string, string>, Map<string, string>>();

function reverseOf(dictionary: Record<string, string>) {
  const cached = reverseCache.get(dictionary);
  if (cached) return cached;
  const map = new Map<string, string>();
  for (const [english, german] of Object.entries(dictionary)) {
    if (!map.has(german)) map.set(german, english);
  }
  reverseCache.set(dictionary, map);
  return map;
}

export function txMap<T extends Record<string, { label: string; tone: string }>>(map: T, tx: (text: string) => string): T {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, { ...value, label: tx(value.label) }])) as T;
}
