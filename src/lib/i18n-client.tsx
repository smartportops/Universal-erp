"use client";

import { createContext, useContext, useMemo } from "react";
import { dictionary } from "@/i18n/dictionary";
import { translate, type Locale } from "@/lib/i18n";

const I18nContext = createContext<(text: string, vars?: Record<string, string | number>) => string>((text) => text);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const tx = useMemo(() => {
    return (text: string, vars?: Record<string, string | number>) => translate(locale, text, dictionary, vars);
  }, [locale]);
  return <I18nContext.Provider value={tx}>{children}</I18nContext.Provider>;
}

export function useTx() {
  return useContext(I18nContext);
}

export function T({ text }: { text: string }) {
  const tx = useTx();
  return <>{tx(text)}</>;
}
