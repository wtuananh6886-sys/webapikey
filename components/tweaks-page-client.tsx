"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui-kit";
import { tweaks } from "@/lib/mock-data";
import { useI18n } from "@/components/i18n-provider";

export function TweaksPageClient() {
  const { t } = useI18n();
  const [platformOwner, setPlatformOwner] = useState(false);
  const [meLoaded, setMeLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { role?: string };
          setPlatformOwner(body.role === "owner");
        }
      } finally {
        setMeLoaded(true);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">{t("tweaks.title")}</h1>
        <p className="text-sm text-slate-400">{t("tweaks.subtitle")}</p>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="p-2">{t("tweaks.colName")}</th>
              <th className="p-2">{t("tweaks.colPackageId")}</th>
              <th className="p-2">{t("tweaks.colVersion")}</th>
              <th className="p-2">{t("tweaks.colStatus")}</th>
              <th className="p-2">{t("tweaks.colPlan")}</th>
            </tr>
          </thead>
          <tbody>
            {tweaks.map((row) => (
              <tr key={row.id} className="border-t border-slate-800">
                <td className="p-2">{row.name}</td>
                <td className="p-2">{row.packageId}</td>
                <td className="p-2">{row.currentVersion}</td>
                <td className="p-2">
                  <Badge>{row.status}</Badge>
                </td>
                <td className="p-2">{row.requiredPlan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {meLoaded && platformOwner ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-white">{t("tweaks.apiClientTitle")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{t("tweaks.apiClientDesc")}</p>
            </div>
            <a
              href="/api.zip"
              download
              className="shrink-0 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-400"
            >
              {t("tweaks.downloadZip")}
            </a>
          </div>
        </Card>
      ) : meLoaded ? (
        <p className="px-1 text-center text-xs text-slate-500">{t("tweaks.ownerOnlyNote")}</p>
      ) : null}
    </div>
  );
}
