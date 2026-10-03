import { cookies } from "next/headers";
import { dictionary } from "@/i18n/dictionary";
import { translate, type Locale, type Theme } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  return jar.get("aera_lang")?.value === "de" ? "de" : "en";
}

export async function getTheme(): Promise<Theme> {
  const jar = await cookies();
  return jar.get("aera_theme")?.value === "dark" ? "dark" : "light";
}

export async function translator() {
  const locale = await getLocale();
  return (text: string, vars?: Record<string, string | number>) => translate(locale, text, dictionary, vars);
}

export { dictionary };
