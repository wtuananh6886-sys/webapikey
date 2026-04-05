"use client";

import { LicensesManager } from "@/components/licenses-manager";
import { Card } from "@/components/ui-kit";
import { useI18n } from "@/components/i18n-provider";

export function LicensesPageClient() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">{t("licenses.introTitle")}</h1>
        <p className="text-sm text-slate-400">{t("licenses.introBody")}</p>
      </Card>
      <LicensesManager />
    </div>
  );
}
