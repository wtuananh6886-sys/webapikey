"use client";

import { useI18n } from "@/components/i18n-provider";

export function SkipToContentLink() {
  const { t } = useI18n();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-[100] focus:rounded-xl focus:bg-[var(--accent-deep)] focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-[#1a1208] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    >
      {t("common.skipToContent")}
    </a>
  );
}
