"use client";

import type { Locale } from "@/lib/i18n/constants";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/i18n/constants";
import { useI18n } from "@/components/i18n-provider";

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className={`flex items-center gap-1.5 ${className}`}>
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={locale}
        aria-label={t("common.language")}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="max-w-[9.5rem] cursor-pointer rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] px-2 py-1.5 text-[11px] font-medium text-[var(--foreground-secondary)] outline-none transition hover:border-[var(--accent)]/35 hover:text-[var(--foreground)] sm:max-w-[11rem] sm:text-xs"
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
