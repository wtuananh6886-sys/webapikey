"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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
  maxDevices: z.number().int().min(1).max(20),
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

export function LicensesManager({ initialData }: { initialData: License[] }) {
  const [licenses, setLicenses] = useState<License[]>(initialData);
  const [submitting, setSubmitting] = useState(false);
  const [accountPackages, setAccountPackages] = useState<Array<{ name: string; token: string; status: string }>>([]);
  const [accountRole, setAccountRole] = useState("viewer");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountUsername, setAccountUsername] = useState("");
  const [currentPackage, setCurrentPackage] = useState("viewer");
  const [creatingPackage, setCreatingPackage] = useState(false);

  const refreshLicenses = useCallback(async () => {
    const res = await fetch("/api/licenses", { method: "GET" });
    if (!res.ok) return;
    const body = (await res.json()) as { data: License[] };
    setLicenses(body.data);
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
    const body = (await res.json()) as { data?: Array<{ name: string; token: string; status: string }> };
    const packages = (body.data ?? []).filter((item) => item.status === "active");
    setAccountPackages(packages);
    if (packages.length > 0 && !form.getValues("packageName")) {
      form.setValue("packageName", packages[0].name, { shouldValidate: true });
    }
  }, [form]);

  const onCreate = async (values: CreateLicenseForm) => {
    setSubmitting(true);
    try {
      if (!selectedPackageToken) {
        toast.error("Package token khong ton tai, vui long tao/chon package hop le");
        return;
      }
      const res = await fetch("/api/licenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
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
  }, [refreshAccountContext]);

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
          <Input
            type="number"
            min={1}
            max={20}
            placeholder="Max devices"
            {...form.register("maxDevices", { valueAsNumber: true })}
          />
          <Input
            type="number"
            min={1}
            max={3650}
            placeholder="Thoi han key (days) - vd: 30"
            {...form.register("durationDays", {
              setValueAs: (value) => (value === "" || value == null ? undefined : Number(value)),
            })}
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
            <p className="text-sm text-slate-400">Tai goi ma nguon mau de them vao tweak ImGui.</p>
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

      <TanstackLicenseTable data={licenses} onRefresh={refreshLicenses} />
    </div>
  );
}
