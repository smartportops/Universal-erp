import { de } from "./dictionary.de";
import { useSettings, type Language } from "./settings";

const dictionaries: Record<Language, Record<string, string>> = { de, en: {} };

export type Tx = (text: string, vars?: Record<string, string | number>) => string;

export function translate(language: Language, text: string, vars?: Record<string, string | number>) {
  let out = dictionaries[language][text] ?? text;
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value));
  return out;
}

/** Hook: `const t = useT(); t("Goods receipt")` – keys are the English UI strings. */
export function useT(): Tx {
  const { language } = useSettings();
  return (text, vars) => translate(language, text, vars);
}
