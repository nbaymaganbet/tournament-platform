"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>("ru");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [current, setCurrent] = useState(locale);
  useEffect(() => { setCurrent(locale); }, [locale]);
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<Locale>).detail;
      if (next === "ru" || next === "kk") setCurrent(next);
    };
    window.addEventListener("tp-language-changed", update);
    return () => window.removeEventListener("tp-language-changed", update);
  }, []);
  return <LocaleContext.Provider value={current}>{children}</LocaleContext.Provider>;
}

export function useLocale() { return useContext(LocaleContext); }
