"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { License } from "@/types/domain";
import { Card, Button, Input, Select } from "@/components/ui-kit";
import { TanstackLicenseTable } from "@/components/tanstack-license-table";

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
  name: string;
  token: string;
  status: string;
  activationUiTitle?: string | null;
  activationUiSubtitle?: string | null;
};

export function LicensesManager({ initialData = [] }: { initialData?: License[] }) {
  const [licenses, setLicenses] = useState<License[]>(initialData);
  const [licensesLoading, setLicensesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accountPackages, setAccountPackages] = useState<AccountPackageRow[]>([]);
  const [accountRole, setAccountRole] = useState("viewer");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountUsername, setAccountUsername] = useState("");
  const [currentPackage, setCurrentPackage] = useState("viewer");
  const [creatingPackage, setCreatingPackage] = useState(false);
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
  const packageForm = useForm<CreatePackageForm>({
    resolver: zodResolver(CreatePackageSchema),
    defaultValues: { packageName: "" },
  });

  const refreshAccountContext = useCallback(async () => {
    const profileRes = await fetch("/api/auth/me", { method: "GET" });
    if (!profileRes.ok) return;
    const profile = (await profileRes.json()) as {
      role?: string;
      currentPackage?: string;
      email?: string;
      username?: string;
    };
    if (profile.role) setAccountRole(profile.role);
    if (profile.currentPackage) setCurrentPackage(profile.currentPackage);
    if (profile.email) setAccountEmail(profile.email);
    if (profile.username) setAccountUsername(profile.username);

    const res = await fetch("/api/packages", { method: "GET" });
    if (!res.ok) return;
    const body = (await res.json()) as { data?: AccountPackageRow[] };
    const packages = (body.data ?? []).filter((item) => item.status === "active");
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
      toast.success("Da tao key moi thanh cong");
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
            <p><span className="font-medium text-white">basic:</span> 1 device, core verify, standard queue support.</p>
            <p><span className="font-medium text-white">pro:</span> 2-3 devices, priority verify, advanced tweak flags.</p>
            <p><span className="font-medium text-white">premium:</span> up to 10 devices, instant unlock, premium support + custom flags.</p>
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
            <p><span className="font-medium text-white">Role:</span> {accountRole}</p>
            <p><span className="font-medium text-white">Current package:</span> {currentPackage}</p>
            <p><span className="font-medium text-white">Your packages:</span> {accountPackages.map((pkg) => pkg.name).join(", ") || "loading..."}</p>
            <p><span className="font-medium text-white">Selected token:</span> {selectedPackageToken || "-"}</p>
            <p><span className="font-medium text-white">Scope:</span> License, Server, Tweaks, Logs, Settings</p>
            <p><span className="font-medium text-white">Status:</span> Active</p>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Package management</h2>
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
