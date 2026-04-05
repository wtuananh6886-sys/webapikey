"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@/components/i18n-provider";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/constants";

export function AppProviders({
  initialLocale,
  children,
}: {
  initialLocale: string;
  children: ReactNode;
}) {
  const safe = isLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE;
  return <I18nProvider initialLocale={safe}>{children}</I18nProvider>;
}
