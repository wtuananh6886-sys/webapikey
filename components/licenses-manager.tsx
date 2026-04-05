"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { License } from "@/types/domain";
import { Card, Button, Input, Select } from "@/components/ui-kit";
import { TanstackLicenseTable } from "@/components/tanstack-license-table";

function formatViAccountDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
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

const CreateLicenseSchema = z.object({
  packageName: z.string().min(2, "Vui long chon package").max(80),
  keyMode: z.enum(["dynamic", "static"]),
  key: z.string().optional(),
  plan: z.enum(["basic", "pro", "premium"]),
  status: z.enum(["active", "inactive", "expired", "banned", "revoked"]),
  assignedUser: z.string().optional(),
  deviceId: z.string().optional(),
  maxDevices: z.number().int().min(1).max(20).optional(),
  durationDays: z.number().int().min(1).max(3650).optional(),
}).superRefine((data, ctx) => {
  if (data.keyMode === "static" && !data.key?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["key"],
      message: "Key tinh can nhap key value",
    });
  }
});

type CreateLicenseForm = z.infer<typeof CreateLicenseSchema>;
const CreatePackageSchema = z.object({
  packageName: z.string().min(2, "Package name toi thieu 2 ky tu").max(80),
});
type CreatePackageForm = z.infer<typeof CreatePackageSchema>;

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
    resolver: zodResolver(CreateLicenseSchema),
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
  const canArchivePackages = accountRole === "owner" || accountRole === "admin";
  const archivedPackageRows = useMemo(
    () => allPackageRows.filter((p) => p.status === "archived"),
    [allPackageRows]
  );
  const packageForm = useForm<CreatePackageForm>({
    resolver: zodResolver(CreatePackageSchema),
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
    if (!canArchivePackages) {
      toast.error("Chỉ owner hoặc admin được gỡ package.");
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
    if (!canArchivePackages) {
      toast.error("Chỉ owner hoặc admin được đổi package token.");
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
          <h3 className="mb-3 text-base font-semibold">Plan privileges</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p><span className="font-medium text-white">basic:</span> gói dashboard — tối đa 3 package token + 30 key / tháng (mặc định user mới).</p>
            <p><span className="font-medium text-white">pro:</span> 10 package token + 200 key / tháng.</p>
            <p><span className="font-medium text-white">premium:</span> 50 package token + 500 key / tháng. Owner không giới hạn.</p>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-base font-semibold">Admin role rights</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p><span className="font-medium text-white">owner:</span> full control, roles/settings/security.</p>
            <p><span className="font-medium text-white">admin:</span> full control (all permissions) for operations.</p>
            <p><span className="font-medium text-white">support/viewer:</span> support can handle keys, viewer read-only.</p>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-base font-semibold">Current account package</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p><span className="font-medium text-white">Email:</span> {accountEmail || "—"}</p>
            <p><span className="font-medium text-white">Username:</span> {accountUsername || "—"}</p>
            <p>
              <span className="font-medium text-white">Tài khoản tạo lúc:</span>{" "}
              <span className="text-slate-200">{formatViAccountDate(accountCreatedAt)}</span>
            </p>
            <p><span className="font-medium text-white">Role:</span> {accountRole}</p>
            <p><span className="font-medium text-white">Current package:</span> {currentPackage}</p>
            <p>
              <span className="font-medium text-white">Package đang hoạt động:</span>{" "}
              {packageMeta?.activeCount ?? accountPackages.length} —{" "}
              <span className="text-slate-400">
                {accountPackages.map((pkg) => pkg.name).join(", ") || (packageMeta ? "—" : "loading...")}
              </span>
            </p>
            <p>
              <span className="font-medium text-white">Đã gỡ (vẫn lưu server):</span>{" "}
              {packageMeta?.archivedCount ?? archivedPackageRows.length}
            </p>
            <p>
              <span className="font-medium text-white">Tổng package (theo dõi):</span> {packageMeta?.totalCount ?? allPackageRows.length}
            </p>
            <p><span className="font-medium text-white">Selected token:</span> {selectedPackageToken || "-"}</p>
            <p><span className="font-medium text-white">Scope:</span> License, Server, Tweaks, Logs, Settings</p>
            <p><span className="font-medium text-white">Status:</span> Active</p>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-base font-semibold">Package management</h2>
        <p className="mb-3 text-sm text-slate-400">
          Chỉ <span className="font-medium text-slate-200">owner</span> hoặc <span className="font-medium text-slate-200">admin</span> mới gỡ package hoặc{" "}
          <span className="font-medium text-slate-200">đổi package token</span> cho user.
          Gỡ = soft delete (dữ liệu vẫn trên server). Đổi token = token cũ vô hiệu, cấp <code className="text-cyan-300/90">PKG_…</code> mới — client bắt buộc cập nhật{" "}
          <code className="text-cyan-300/90">packageToken</code>.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 sm:text-sm">
            Hoạt động: {packageMeta?.activeCount ?? accountPackages.length}
          </span>
          <span className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 sm:text-sm">
            Đã gỡ: {packageMeta?.archivedCount ?? archivedPackageRows.length}
          </span>
          <span className="rounded-lg border border-slate-600/80 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 sm:text-sm">
            Tổng: {packageMeta?.totalCount ?? allPackageRows.length}
          </span>
        </div>
        {(accountPackages.length > 0 || archivedPackageRows.length > 0) && (
          <div className="mb-4 overflow-x-auto rounded-xl border border-slate-700/70">
            <table className="w-full min-w-[36rem] text-left text-sm text-slate-300 sm:min-w-0">
              <thead className="border-b border-slate-700/80 bg-slate-900/50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Package</th>
                  {(accountRole === "owner" || accountRole === "admin") && <th className="px-3 py-2.5 font-medium">Owner</th>}
                  <th className="px-3 py-2.5 font-medium">Tạo</th>
                  <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                  {canArchivePackages && <th className="px-3 py-2.5 font-medium text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/90">
                {accountPackages.map((pkg) => (
                  <tr key={pkg.name} className="bg-slate-950/20">
                    <td className="px-3 py-2.5 font-medium text-white">{pkg.name}</td>
                    {(accountRole === "owner" || accountRole === "admin") && (
                      <td className="max-w-[10rem] truncate px-3 py-2.5 text-xs text-slate-400" title={pkg.ownerEmail}>
                        {pkg.ownerEmail ?? "—"}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                      {formatViAccountDate(pkg.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-200">active</span>
                    </td>
                    {canArchivePackages && (
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={tokenRegeneratingName === pkg.name || archivingName === pkg.name}
                            onClick={() => void regeneratePackageToken(pkg.name)}
                            className="touch-manipulation rounded-lg border border-amber-500/45 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {tokenRegeneratingName === pkg.name ? "…" : "Đổi token"}
                          </button>
                          <button
                            type="button"
                            disabled={archivingName === pkg.name || tokenRegeneratingName === pkg.name}
                            onClick={() => void archivePackage(pkg.name)}
                            className="touch-manipulation rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {archivingName === pkg.name ? "…" : "Gỡ"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {archivedPackageRows.map((pkg) => (
                  <tr key={`arch-${pkg.name}`} className="bg-slate-900/40 opacity-90">
                    <td className="px-3 py-2.5 font-medium text-slate-400 line-through decoration-slate-600">{pkg.name}</td>
                    {(accountRole === "owner" || accountRole === "admin") && (
                      <td className="max-w-[10rem] truncate px-3 py-2.5 text-xs text-slate-500" title={pkg.ownerEmail}>
                        {pkg.ownerEmail ?? "—"}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{formatViAccountDate(pkg.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="w-fit rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200">archived</span>
                        <span className="text-[10px] text-slate-500">Gỡ: {formatViAccountDate(pkg.archivedAt)}</span>
                      </div>
                    </td>
                    {canArchivePackages && <td className="px-3 py-2.5 text-right text-xs text-slate-600">—</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={packageForm.handleSubmit(onCreatePackage)}>
          <div className="md:col-span-3">
            <Input placeholder="Tao package moi (vd: tuananh)" {...packageForm.register("packageName")} />
          </div>
          <Button type="submit" disabled={creatingPackage}>
            {creatingPackage ? "Dang tao..." : "Tao Package"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          {packageForm.formState.errors.packageName?.message || "Moi account co package rieng, key se bi bind theo package."}
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold">Tiêu đề màn hình nhập key (client / ImGui)</h2>
        <p className="mb-3 text-sm text-slate-400">
          Mỗi package có thể đặt title & dòng phụ hiển thị trên tweak. Để trống title → client dùng mặc định &quot;AOV Pro Activation&quot;. API:{" "}
          <code className="text-xs text-cyan-300/90">POST /api/licenses/activation-ui</code> với <code className="text-xs">packageToken</code>.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select value={brandPkg} onChange={(e) => setBrandPkg(e.target.value)} disabled={accountPackages.length === 0}>
            {accountPackages.length === 0 ? (
              <option value="">Chưa có package</option>
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
              placeholder="Tiêu đề (vd: Shop Key VIP)"
              value={brandTitle}
              onChange={(e) => setBrandTitle(e.target.value)}
              maxLength={80}
            />
            <Input
              placeholder="Dòng phụ tùy chọn (vd: Liên hệ admin sau khi mua)"
              value={brandSub}
              onChange={(e) => setBrandSub(e.target.value)}
              maxLength={160}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <Button type="button" disabled={savingBrand || accountPackages.length === 0} onClick={() => void saveActivationBranding()}>
              {savingBrand ? "Đang lưu…" : "Lưu tiêu đề"}
            </Button>
            <button
              type="button"
              disabled={brandPreviewLoading || accountPackages.length === 0 || !brandPkg}
              onClick={() => void testActivationUiApi()}
              className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {brandPreviewLoading ? "Đang gọi API…" : "Thử API (như tweak)"}
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

      <Card>
        <h2 className="text-base font-semibold">Tao key moi</h2>
        <p className="mb-4 text-sm text-slate-400">Chon package cua account. Key format bat buoc: package-&lt;days&gt;day-XXXXXX.</p>
        <div className="mb-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200">
          Key preview: {(selectedPackageName || "package-name")}-{selectedDurationDays ?? defaultExpiry}day-XXXXXX
        </div>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={form.handleSubmit(onCreate)}>
          <Select {...form.register("packageName")}>
            <option value="">Select package</option>
            {accountPackages.map((pkg) => (
              <option key={pkg.name} value={pkg.name}>{pkg.name}</option>
            ))}
          </Select>
          <Select {...form.register("keyMode")}>
            <option value="dynamic">dynamic (system auto generate)</option>
            <option value="static">static (custom key value)</option>
          </Select>
          <Select {...form.register("plan")}>
            <option value="basic">basic</option>
            <option value="pro">pro</option>
            <option value="premium">premium</option>
          </Select>
          <Input
            placeholder="Custom key static (vd: abcvip-30day-X9K2Q1)"
            disabled={keyMode !== "static"}
            {...form.register("key")}
          />
          <Select {...form.register("status")}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="expired">expired</option>
            <option value="banned">banned</option>
            <option value="revoked">revoked</option>
          </Select>
          <Input placeholder="Assigned user (optional)" {...form.register("assignedUser")} />
          <Input placeholder="Device ID (optional)" {...form.register("deviceId")} />
          <Controller
            name="maxDevices"
            control={form.control}
            render={({ field }) => (
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Max devices (1–20)"
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
                placeholder="Thoi han key (days) - vd: 30"
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
          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Dang tao..." : "Tao Key"}
            </Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          {form.formState.errors.key?.message || form.formState.errors.packageName?.message || form.formState.errors.durationDays?.message}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            className="bg-slate-700 hover:bg-slate-600"
            onClick={() => {
              if (!selectedPackageToken) return;
              navigator.clipboard.writeText(selectedPackageToken);
              toast.success("Da copy package token");
            }}
          >
            Copy package token
          </Button>
          <p className="text-xs text-slate-500">Token nay can truyen trong UI enter key (packageToken).</p>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">ImGui API Client</h3>
            <p className="text-sm text-slate-400">
              File <code className="text-xs text-cyan-300/90">public/api.zip</code> tạo lúc <code className="text-xs">npm run build</code> / <code className="text-xs">dev</code> từ <code className="text-xs">integration-client</code> — deploy lại là zip mới.
            </p>
          </div>
          <a
            href="/api.zip"
            download
            className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-400"
          >
            Tai api.zip
          </a>
        </div>
      </Card>

      {licensesLoading ? (
        <Card className="p-6 text-center text-sm text-slate-400">Đang tải danh sách key từ server…</Card>
      ) : (
        <TanstackLicenseTable data={licenses} onRefresh={refreshLicenses} />
      )}
    </div>
  );
}
