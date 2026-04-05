"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { License } from "@/types/domain";
import { Card, Button, Input, Select } from "@/components/ui-kit";
import { TanstackLicenseTable } from "@/components/tanstack-license-table";
import { useI18n } from "@/components/i18n-provider";
import type { Locale } from "@/lib/i18n/constants";

function formatAccountDate(iso: string | null | undefined, locale: Locale) {
  if (!iso) return "—";
  const loc = locale === "vi" ? "vi-VN" : locale === "en" ? "en-US" : locale === "zh-CN" ? "zh-CN" : "zh-TW";
  try {
    return new Date(iso).toLocaleString(loc, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildCreateLicenseSchema(t: (key: string) => string) {
  return z
    .object({
      packageName: z.string().max(80),
      keyMode: z.enum(["dynamic", "static"]),
      key: z.string().optional(),
      plan: z.enum(["basic", "pro", "premium"]),
      status: z.enum(["active", "inactive", "expired", "banned", "revoked"]),
      assignedUser: z.string().optional(),
      deviceId: z.string().optional(),
      maxDevices: z.number().int().min(1).max(20).optional(),
      durationDays: z.number().int().min(1).max(3650).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.packageName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["packageName"],
          message: t("licenses.validationPackageName"),
        });
      }
      if (data.keyMode === "static" && !data.key?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["key"],
          message: t("licenses.validationStaticKey"),
        });
      }
    });
}

type CreateLicenseForm = z.infer<ReturnType<typeof buildCreateLicenseSchema>>;

function buildCreatePackageSchema(t: (key: string) => string) {
  return z.object({ packageName: z.string().max(80) }).superRefine((data, ctx) => {
    if (data.packageName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["packageName"],
        message: t("licenses.validationPackageName"),
      });
    }
  });
}

type CreatePackageForm = z.infer<ReturnType<typeof buildCreatePackageSchema>>;

type AccountPackageRow = {
  id?: string;
  name: string;
  token: string;
  status: string;
  createdAt?: string;
  archivedAt?: string | null;
  ownerEmail?: string;
  activationUiTitle?: string | null;
  activationUiSubtitle?: string | null;
};

type PackageListMeta = {
  activeCount: number;
  archivedCount: number;
  totalCount: number;
};

export function LicensesManager({ initialData = [] }: { initialData?: License[] }) {
  const { locale } = useI18n();
  return <LicensesManagerCore key={locale} initialData={initialData} />;
}

function LicensesManagerCore({ initialData = [] }: { initialData?: License[] }) {
  const { t, locale } = useI18n();
  const createLicenseSchema = useMemo(() => buildCreateLicenseSchema(t), [t]);
  const createPackageSchema = useMemo(() => buildCreatePackageSchema(t), [t]);
  const [licenses, setLicenses] = useState<License[]>(initialData);
  const [licensesLoading, setLicensesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accountPackages, setAccountPackages] = useState<AccountPackageRow[]>([]);
  const [accountRole, setAccountRole] = useState("viewer");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountUsername, setAccountUsername] = useState("");
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [currentPackage, setCurrentPackage] = useState("viewer");
  const [creatingPackage, setCreatingPackage] = useState(false);
  const [allPackageRows, setAllPackageRows] = useState<AccountPackageRow[]>([]);
  const [packageMeta, setPackageMeta] = useState<PackageListMeta | null>(null);
  const [archivingName, setArchivingName] = useState<string | null>(null);
  const [tokenRegeneratingName, setTokenRegeneratingName] = useState<string | null>(null);
  const [brandPkg, setBrandPkg] = useState("");
  const [brandTitle, setBrandTitle] = useState("");
  const [brandSub, setBrandSub] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandPreviewLoading, setBrandPreviewLoading] = useState(false);
  const [brandPreview, setBrandPreview] = useState<{
    ok: boolean;
    uiTitle?: string;
    uiSubtitle?: string | null;
    reason?: string;
  } | null>(null);

  const refreshLicenses = useCallback(async (options?: { showLoadingOverlay?: boolean }) => {
    const showOverlay = options?.showLoadingOverlay ?? false;
    if (showOverlay) setLicensesLoading(true);
    try {
      const res = await fetch("/api/licenses", { method: "GET", credentials: "same-origin" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(
          err?.message ?? `Không tải được danh sách key (HTTP ${res.status}). Kiểm tra đăng nhập / biến môi trường Supabase trên server.`
        );
        setLicenses([]);
        return;
      }
      const body = (await res.json()) as { data: License[] };
      setLicenses(Array.isArray(body.data) ? body.data : []);
    } catch {
      toast.error("Lỗi mạng khi tải danh sách key.");
      setLicenses([]);
    } finally {
      if (showOverlay) setLicensesLoading(false);
    }
  }, []);

  const defaultExpiry = useMemo(() => 30, []);

  const form = useForm<CreateLicenseForm>({
    resolver: zodResolver(createLicenseSchema),
    defaultValues: {
      packageName: "",
      keyMode: "dynamic",
      key: "",
      plan: "pro",
      status: "active",
      assignedUser: "",
      deviceId: "",
      maxDevices: 1,
      durationDays: undefined,
    },
  });
  const keyMode = form.watch("keyMode");
  const selectedPackageName = form.watch("packageName");
  const selectedDurationDays = form.watch("durationDays");
  const selectedPackageToken = useMemo(
    () => accountPackages.find((pkg) => pkg.name === selectedPackageName)?.token ?? "",
    [accountPackages, selectedPackageName]
  );
  const isPlatformOwner = accountRole === "owner";
  const archivedPackageRows = useMemo(
    () => allPackageRows.filter((p) => p.status === "archived"),
    [allPackageRows]
  );
  const packageForm = useForm<CreatePackageForm>({
    resolver: zodResolver(createPackageSchema),
    defaultValues: { packageName: "" },
  });

  const refreshAccountContext = useCallback(async () => {
    const profileRes = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!profileRes.ok) return;
    const profile = (await profileRes.json()) as {
      role?: string;
      currentPackage?: string;
      email?: string;
      username?: string;
      accountCreatedAt?: string | null;
    };
    if (profile.role) setAccountRole(profile.role);
    if (profile.currentPackage) setCurrentPackage(profile.currentPackage);
    if (profile.email) setAccountEmail(profile.email);
    if (profile.username) setAccountUsername(profile.username);
    setAccountCreatedAt(profile.accountCreatedAt ?? null);

    const res = await fetch("/api/packages", { method: "GET" });
    if (!res.ok) return;
    const body = (await res.json()) as { data?: AccountPackageRow[]; meta?: PackageListMeta };
    const rows = body.data ?? [];
    setAllPackageRows(rows);
    setPackageMeta(body.meta ?? null);
    const packages = rows.filter((item) => item.status === "active");
    setAccountPackages(packages);
    if (packages.length > 0 && !form.getValues("packageName")) {
      form.setValue("packageName", packages[0].name, { shouldValidate: true });
    }
  }, [form]);

  useEffect(() => {
    if (accountPackages.length === 0) {
      setBrandPkg("");
      setBrandTitle("");
      setBrandSub("");
      return;
    }
    if (!brandPkg || !accountPackages.some((p) => p.name === brandPkg)) {
      setBrandPkg(accountPackages[0].name);
    }
  }, [accountPackages, brandPkg]);

  useEffect(() => {
    const p = accountPackages.find((x) => x.name === brandPkg);
    if (!p) return;
    setBrandTitle(p.activationUiTitle?.trim() ?? "");
    setBrandSub(p.activationUiSubtitle?.trim() ?? "");
  }, [brandPkg, accountPackages]);

  const saveActivationBranding = async () => {
    if (!brandPkg) {
      toast.error("Chọn package");
      return;
    }
    setSavingBrand(true);
    try {
      const res = await fetch("/api/packages", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: brandPkg,
          activationUiTitle: brandTitle.trim() === "" ? null : brandTitle.trim(),
          activationUiSubtitle: brandSub.trim() === "" ? null : brandSub.trim(),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(err?.message ?? "Lưu thất bại");
        return;
      }
      toast.success("Đã lưu tiêu đề màn hình nhập key");
      await refreshAccountContext();
    } finally {
      setSavingBrand(false);
    }
  };

  const archivePackage = async (name: string) => {
    if (!isPlatformOwner) {
      toast.error("Chỉ owner nền tảng được gỡ package.");
      return;
    }
    const ok = window.confirm(
      `Gỡ package "${name}"?\n\nBản ghi vẫn lưu trên server (trạng thái archived) để theo dõi — key cũ không tạo mới / không kích hoạt thêm với package này.`
    );
    if (!ok) return;
    setArchivingName(name);
    try {
      const res = await fetch(`/api/packages?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        toast.error(payload?.message ?? `Lỗi HTTP ${res.status}`);
        return;
      }
      toast.success(payload?.message ?? "Đã gỡ package (soft delete).");
      if (form.getValues("packageName") === name) {
        form.setValue("packageName", "", { shouldValidate: false });
      }
      await refreshAccountContext();
    } finally {
      setArchivingName(null);
    }
  };

  const regeneratePackageToken = async (name: string) => {
    if (!isPlatformOwner) {
      toast.error("Chỉ owner nền tảng được đổi package token.");
      return;
    }
    const ok = window.confirm(
      `Đổi package token cho "${name}"?\n\nToken cũ sẽ hết hiệu lực ngay (verify / activation-ui / tạo key). User phải dùng token mới trên client.`
    );
    if (!ok) return;
    setTokenRegeneratingName(name);
    try {
      const res = await fetch("/api/packages", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, regenerateToken: true }),
      });
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        toast.error(payload?.message ?? `Lỗi HTTP ${res.status}`);
        return;
      }
      toast.success(payload?.message ?? "Đã đổi package token.");
      await refreshAccountContext();
    } finally {
      setTokenRegeneratingName(null);
    }
  };

  const testActivationUiApi = async () => {
    const tok = accountPackages.find((p) => p.name === brandPkg)?.token;
    if (!tok || tok.length < 8) {
      toast.error("Chọn package có token hợp lệ");
      return;
    }
    setBrandPreviewLoading(true);
    setBrandPreview(null);
    try {
      const res = await fetch("/api/licenses/activation-ui", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ packageToken: tok }),
      });
      const j = (await res.json()) as { ok?: boolean; uiTitle?: string; uiSubtitle?: string | null; reason?: string; message?: string };
      if (!res.ok || !j.ok) {
        const reason = j.reason ?? j.message ?? `HTTP ${res.status}`;
        setBrandPreview({ ok: false, reason: String(reason) });
        toast.error(`API: ${reason}`);
        return;
      }
      setBrandPreview({
        ok: true,
        uiTitle: typeof j.uiTitle === "string" ? j.uiTitle : undefined,
        uiSubtitle: j.uiSubtitle === undefined ? null : j.uiSubtitle,
      });
      toast.success("Client (tweak) sẽ nhận title/subtitle như bên dưới");
    } catch {
      toast.error("Lỗi mạng khi gọi activation-ui");
      setBrandPreview({ ok: false, reason: "network" });
    } finally {
      setBrandPreviewLoading(false);
    }
  };

  const onCreate = async (values: CreateLicenseForm) => {
    setSubmitting(true);
    try {
      if (!selectedPackageToken) {
        toast.error("Package token khong ton tai, vui long tao/chon package hop le");
        return;
      }
      const maxDevices =
        values.maxDevices == null || Number.isNaN(values.maxDevices)
          ? 1
          : Math.min(20, Math.max(1, values.maxDevices));
      const res = await fetch("/api/licenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          maxDevices,
          packageToken: selectedPackageToken,
          durationDays: values.durationDays ?? defaultExpiry,
          assignedUser: values.assignedUser || null,
          deviceId: values.deviceId || null,
          key: values.key?.trim() ? values.key.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(err?.message ?? "Tao key that bai");
        return;
      }
      const body = (await res.json()) as { data: License };
      setLicenses((prev) => [body.data, ...prev]);
      form.reset({
        packageName: accountPackages[0]?.name ?? "",
        keyMode: "dynamic",
        key: "",
        plan: "pro",
        status: "active",
        assignedUser: "",
        deviceId: "",
        maxDevices: 1,
        durationDays: undefined,
      });
      toast.success("Đã tạo key — lưu / sao chép ngay. Sau khi tải lại trang chỉ còn hiển thị một phần.", {
        duration: 10_000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onCreatePackage = async (values: CreatePackageForm) => {
    setCreatingPackage(true);
    try {
      const res = await fetch("/api/packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: values.packageName }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(err?.message ?? "Failed to create package");
        return;
      }
      const body = (await res.json()) as { data: { name: string; token: string; status: string } };
      const newPackage = body.data;
      setAccountPackages((prev) => {
        const merged = [newPackage, ...prev.filter((pkg) => pkg.name !== newPackage.name)];
        return merged;
      });
      form.setValue("packageName", newPackage.name, { shouldValidate: true });
      packageForm.reset({ packageName: "" });
      toast.success("Da tao package moi");
    } finally {
      setCreatingPackage(false);
    }
  };

  useEffect(() => {
    void refreshAccountContext();
    void refreshLicenses({ showLoadingOverlay: true });
  }, [refreshAccountContext, refreshLicenses]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h3 className="mb-3 text-base font-semibold">{t("licenses.planPrivileges")}</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>{t("licenses.planBasic")}</p>
            <p>{t("licenses.planPro")}</p>
            <p>{t("licenses.planPremium")}</p>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-base font-semibold">{t("licenses.roleRights")}</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>{t("licenses.roleOwner")}</p>
            <p>{t("licenses.roleAdmin")}</p>
            <p>{t("licenses.roleSupport")}</p>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-base font-semibold">{t("licenses.currentAccount")}</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              <span className="font-medium text-white">{t("dashboard.email")}:</span> {accountEmail || "—"}
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.username")}:</span> {accountUsername || "—"}
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.accountCreatedLabel")}</span>{" "}
              <span className="text-slate-200">{formatAccountDate(accountCreatedAt, locale)}</span>
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.role")}:</span> {accountRole}
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.currentPackage")}:</span> {currentPackage}
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.activePackages")}</span>{" "}
              {packageMeta?.activeCount ?? accountPackages.length} —{" "}
              <span className="text-slate-400">
                {accountPackages.map((pkg) => pkg.name).join(", ") || (packageMeta ? "—" : t("common.loading"))}
              </span>
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.archivedStored")}</span>{" "}
              {packageMeta?.archivedCount ?? archivedPackageRows.length}
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.totalTracked")}</span> {packageMeta?.totalCount ?? allPackageRows.length}
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.selectedToken")}:</span> {selectedPackageToken || "—"}
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.scope")}</span> {t("licenses.scopeValue")}
            </p>
            <p>
              <span className="font-medium text-white">{t("licenses.status")}</span> {t("licenses.accountStatusLabel")}
            </p>
          </div>
        </Card>
      </div>

      {isPlatformOwner ? (
        <Card>
          <h2 className="mb-2 text-base font-semibold">{t("licenses.packageMgmtTitle")}</h2>
          <p className="mb-3 text-sm leading-relaxed text-slate-400">{t("licenses.packageMgmtDesc")}</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 sm:text-sm">
              {t("licenses.active")} {packageMeta?.activeCount ?? accountPackages.length}
            </span>
            <span className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 sm:text-sm">
              {t("licenses.archived")} {packageMeta?.archivedCount ?? archivedPackageRows.length}
            </span>
            <span className="rounded-lg border border-slate-600/80 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 sm:text-sm">
              {t("licenses.total")} {packageMeta?.totalCount ?? allPackageRows.length}
            </span>
          </div>
          {(accountPackages.length > 0 || archivedPackageRows.length > 0) && (
            <div className="overflow-x-auto rounded-xl border border-slate-700/70">
              <table className="w-full min-w-[36rem] text-left text-sm text-slate-300 sm:min-w-0">
                <thead className="border-b border-slate-700/80 bg-slate-900/50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">{t("licenses.colPackage")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("licenses.colOwner")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("licenses.colCreated")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("licenses.colState")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t("licenses.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/90">
                  {accountPackages.map((pkg) => (
                    <tr key={pkg.name} className="bg-slate-950/20">
                      <td className="px-3 py-2.5 font-medium text-white">{pkg.name}</td>
                      <td className="max-w-[10rem] truncate px-3 py-2.5 text-xs text-slate-400" title={pkg.ownerEmail}>
                        {pkg.ownerEmail ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                        {formatAccountDate(pkg.createdAt, locale)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-200">
                          {t("licenses.stateActive")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={tokenRegeneratingName === pkg.name || archivingName === pkg.name}
                            onClick={() => void regeneratePackageToken(pkg.name)}
                            className="touch-manipulation rounded-lg border border-amber-500/45 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {tokenRegeneratingName === pkg.name ? "…" : t("licenses.changeToken")}
                          </button>
                          <button
                            type="button"
                            disabled={archivingName === pkg.name || tokenRegeneratingName === pkg.name}
                            onClick={() => void archivePackage(pkg.name)}
                            className="touch-manipulation rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {archivingName === pkg.name ? "…" : t("licenses.remove")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {archivedPackageRows.map((pkg) => (
                    <tr key={`arch-${pkg.name}`} className="bg-slate-900/40 opacity-90">
                      <td className="px-3 py-2.5 font-medium text-slate-400 line-through decoration-slate-600">{pkg.name}</td>
                      <td className="max-w-[10rem] truncate px-3 py-2.5 text-xs text-slate-500" title={pkg.ownerEmail}>
                        {pkg.ownerEmail ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{formatAccountDate(pkg.createdAt, locale)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="w-fit rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200">
                            {t("licenses.stateArchived")}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {t("licenses.removedAt")} {formatAccountDate(pkg.archivedAt, locale)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-slate-600">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-2 text-base font-semibold">{t("licenses.createPackageTitle")}</h2>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={packageForm.handleSubmit(onCreatePackage)}>
          <div className="md:col-span-3">
            <Input placeholder={t("licenses.createPackagePlaceholder")} {...packageForm.register("packageName")} />
          </div>
          <Button type="submit" disabled={creatingPackage}>
            {creatingPackage ? t("licenses.createPackageLoading") : t("licenses.createPackageSubmit")}
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          {packageForm.formState.errors.packageName?.message || t("licenses.createPackageHint")}
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold">{t("licenses.activationTitle")}</h2>
        <p className="mb-3 text-sm leading-relaxed text-slate-400">{t("licenses.activationDesc")}</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select value={brandPkg} onChange={(e) => setBrandPkg(e.target.value)} disabled={accountPackages.length === 0}>
            {accountPackages.length === 0 ? (
              <option value="">{t("licenses.noPackage")}</option>
            ) : (
              accountPackages.map((pkg) => (
                <option key={pkg.name} value={pkg.name}>
                  {pkg.name}
                </option>
              ))
            )}
          </Select>
          <div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
            <Input
              placeholder={t("licenses.titlePlaceholder")}
              value={brandTitle}
              onChange={(e) => setBrandTitle(e.target.value)}
              maxLength={80}
            />
            <Input
              placeholder={t("licenses.subtitlePlaceholder")}
              value={brandSub}
              onChange={(e) => setBrandSub(e.target.value)}
              maxLength={160}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <Button type="button" disabled={savingBrand || accountPackages.length === 0} onClick={() => void saveActivationBranding()}>
              {savingBrand ? t("licenses.saving") : t("licenses.saveBranding")}
            </Button>
            <button
              type="button"
              disabled={brandPreviewLoading || accountPackages.length === 0 || !brandPkg}
              onClick={() => void testActivationUiApi()}
              className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {brandPreviewLoading ? t("licenses.testingApi") : t("licenses.testApi")}
            </button>
          </div>
          {brandPreview && (
            <div className="md:col-span-2 rounded-lg border border-slate-600/80 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
              {brandPreview.ok ? (
                <p>
                  <span className="font-medium text-emerald-300">uiTitle:</span> {brandPreview.uiTitle ?? "—"}
                  <br />
                  <span className="font-medium text-emerald-300">uiSubtitle:</span>{" "}
                  {brandPreview.uiSubtitle === null || brandPreview.uiSubtitle === undefined || brandPreview.uiSubtitle === ""
                    ? "—"
                    : brandPreview.uiSubtitle}
                </p>
              ) : (
                <p className="text-red-300">Lỗi: {brandPreview.reason ?? "unknown"}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden border-cyan-500/15 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-cyan-950/20">
        <div className="mb-4 flex flex-col gap-1 border-b border-slate-700/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white">{t("licenses.createKeyTitle")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">{t("licenses.createKeySubtitle")}</p>
          </div>
          <div className="mt-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 font-mono text-[11px] text-cyan-100 sm:mt-0 sm:text-xs">
            <span className="text-cyan-400/90">{t("licenses.keyPreview")}</span>{" "}
            {(selectedPackageName || "package-name")}-{selectedDurationDays ?? defaultExpiry}day-XXXXXX
          </div>
        </div>

        <form className="space-y-6" onSubmit={form.handleSubmit(onCreate)}>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("licenses.sectionPackage")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select {...form.register("packageName")}>
                <option value="">{t("licenses.selectPackage")}</option>
                {accountPackages.map((pkg) => (
                  <option key={pkg.name} value={pkg.name}>
                    {pkg.name}
                  </option>
                ))}
              </Select>
              <Select {...form.register("keyMode")}>
                <option value="dynamic">{t("licenses.keyModeDynamic")}</option>
                <option value="static">{t("licenses.keyModeStatic")}</option>
              </Select>
              <Input
                className="sm:col-span-2 lg:col-span-1"
                placeholder={t("licenses.customKeyPlaceholder")}
                disabled={keyMode !== "static"}
                {...form.register("key")}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("licenses.sectionAccess")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select {...form.register("plan")}>
                <option value="basic">{t("licenses.optPlanBasic")}</option>
                <option value="pro">{t("licenses.optPlanPro")}</option>
                <option value="premium">{t("licenses.optPlanPremium")}</option>
              </Select>
              <Select {...form.register("status")}>
                <option value="active">{t("licenses.optStatusActive")}</option>
                <option value="inactive">{t("licenses.optStatusInactive")}</option>
                <option value="expired">{t("licenses.optStatusExpired")}</option>
                <option value="banned">{t("licenses.optStatusBanned")}</option>
                <option value="revoked">{t("licenses.optStatusRevoked")}</option>
              </Select>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("licenses.sectionDevice")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input placeholder={t("licenses.assignedUser")} {...form.register("assignedUser")} />
              <Input placeholder={t("licenses.deviceId")} {...form.register("deviceId")} />
              <Controller
                name="maxDevices"
                control={form.control}
                render={({ field }) => (
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={t("licenses.maxDevices")}
                    value={field.value === undefined || field.value === null ? "" : String(field.value)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      if (digits === "") {
                        field.onChange(undefined);
                        return;
                      }
                      const n = parseInt(digits, 10);
                      if (!Number.isNaN(n)) field.onChange(n);
                    }}
                    onBlur={() => {
                      const v = field.value;
                      if (v === undefined || v === null || Number.isNaN(v) || v < 1) field.onChange(1);
                      else if (v > 20) field.onChange(20);
                      field.onBlur();
                    }}
                  />
                )}
              />
              <Controller
                name="durationDays"
                control={form.control}
                render={({ field }) => (
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={t("licenses.durationDays")}
                    value={field.value === undefined || field.value === null ? "" : String(field.value)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      if (digits === "") {
                        field.onChange(undefined);
                        return;
                      }
                      const n = parseInt(digits, 10);
                      if (!Number.isNaN(n)) field.onChange(n);
                    }}
                    onBlur={() => {
                      field.onBlur();
                    }}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-700/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="submit" disabled={submitting} className="min-h-11 w-full sm:w-auto">
              {submitting ? t("licenses.creatingKey") : t("licenses.submitCreateKey")}
            </Button>
            <div className="flex flex-col gap-2 sm:items-end">
              <Button
                type="button"
                variant="secondary"
                className="w-full border-slate-600 bg-slate-800/80 hover:bg-slate-700 sm:w-auto"
                onClick={() => {
                  if (!selectedPackageToken) return;
                  void navigator.clipboard.writeText(selectedPackageToken);
                  toast.success(t("licenses.copyTokenToast"));
                }}
              >
                {t("licenses.copyPackageToken")}
              </Button>
              <p className="max-w-md text-right text-[11px] text-slate-500">{t("licenses.copyTokenHint")}</p>
            </div>
          </div>
        </form>
        <p className="mt-3 text-xs text-amber-200/80">
          {form.formState.errors.key?.message ||
            form.formState.errors.packageName?.message ||
            form.formState.errors.durationDays?.message}
        </p>
      </Card>

      {licensesLoading ? (
        <Card className="p-6 text-center text-sm text-slate-400">{t("licenses.loadingKeys")}</Card>
      ) : (
        <TanstackLicenseTable data={licenses} onRefresh={refreshLicenses} />
      )}
    </div>
  );
}
