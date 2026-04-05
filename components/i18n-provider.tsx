"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Locale } from "@/lib/i18n/constants";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n/constants";
import { resolveMessage } from "@/lib/i18n/resolve-message";

type I18nContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (path: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function htmlLangForLocale(locale: Locale): string {
  if (locale === "vi") return "vi";
  if (locale === "en") return "en";
  return "zh";
}

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: string;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    isLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }, []);

  useEffect(() => {
    document.documentElement.lang = htmlLangForLocale(locale);
  }, [locale]);

  const t = useCallback(
    (path: string) => resolveMessage(locale, path) ?? path,
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
