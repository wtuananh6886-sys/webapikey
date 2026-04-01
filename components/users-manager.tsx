"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Pencil, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Select } from "@/components/ui-kit";
import type { AdminStatus, LicensePlan, Role } from "@/types/domain";
import { quotaForAssignedPlan } from "@/lib/plan-quota";

type UserRow = {
  id: string;
  email: string;
  username: string;
  role: Role;
  status: AdminStatus;
  createdAt: string;
  lastLoginAt: string | null;
  hasLoginCredentials: boolean;
  source: string;
  policy: {
    assignedPlan: LicensePlan;
    monthlyPackageTokenLimit: number;
    monthlyKeyLimit: number;
    packageTokensUsedThisMonth: number;
    keysUsedThisMonth: number;
    expiresAt: string | null;
  } | null;
  flags: { protectedOwner: boolean; isSelf: boolean };
};

type PolicyShape = NonNullable<UserRow["policy"]>;

const emptyPolicy = (role: Role): PolicyShape => {
  if (role === "owner") {
    return {
      assignedPlan: "premium",
      monthlyPackageTokenLimit: 99_999,
      monthlyKeyLimit: 999_999,
      packageTokensUsedThisMonth: 0,
      keysUsedThisMonth: 0,
      expiresAt: null,
    };
  }
  const q = quotaForAssignedPlan("basic");
  return {
    assignedPlan: "basic",
    monthlyPackageTokenLimit: q.monthlyPackageTokenLimit,
    monthlyKeyLimit: q.monthlyKeyLimit,
    packageTokensUsedThisMonth: 0,
    keysUsedThisMonth: 0,
    expiresAt: null,
  };
};

export function UsersManager() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  /** String drafts so users can clear the field and type a new number without "010" glitches. */
  const [pkgLimitStr, setPkgLimitStr] = useState("");
  const [keyLimitStr, setKeyLimitStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users", { method: "GET" });
    setLoading(false);
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (!res.ok) {
      toast.error("Failed to load users");
      return;
    }
    const body = (await res.json()) as { data: UserRow[]; meta?: { canDeleteAccounts?: boolean } };
    setRows(body.data ?? []);
    setCanDelete(Boolean(body.meta?.canDeleteAccounts));
    setForbidden(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.email.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const openEdit = (row: UserRow) => {
    const pol = row.policy ?? emptyPolicy(row.role);
    setEditing({ ...row, policy: pol });
    setPkgLimitStr(String(pol.monthlyPackageTokenLimit));
    setKeyLimitStr(String(pol.monthlyKeyLimit));
  };

  const parseQuota = (raw: string) => {
    const t = raw.trim();
    if (t === "") return 0;
    const n = parseInt(t, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const saveEdit = async () => {
    if (!editing?.policy) return;
    setSaving(true);
    const p = editing.policy;
    const monthlyPackageTokenLimit = parseQuota(pkgLimitStr);
    const monthlyKeyLimit = parseQuota(keyLimitStr);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: editing.email,
        role: editing.role,
        status: editing.status,
        assignedPlan: p.assignedPlan,
        monthlyPackageTokenLimit,
        monthlyKeyLimit,
        expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString() : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      toast.error(err?.message ?? "Update failed");
      return;
    }
    toast.success("User updated");
    setEditing(null);
    void load();
  };

  const doDelete = async (email: string) => {
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setDeleteConfirm(null);
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      toast.error(err?.message ?? "Delete failed");
      return;
    }
    toast.success("User removed");
    void load();
  };

  if (forbidden) {
    return (
      <Card>
        <p className="text-sm text-slate-400">You need owner or admin role to manage registered accounts.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Registered accounts</h2>
            <p className="text-sm text-slate-400">
              View everyone on the server, adjust role, status, and usage plan. Delete is owner-only.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search email, username, role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="hidden md:block">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-800 text-left text-slate-400">
              <tr>
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Plan / quota</th>
                <th className="p-3 font-medium">Login</th>
                <th className="p-3 font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">
                    No accounts match.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800/80 align-top">
                    <td className="p-3">
                      <p className="font-medium text-white" title={row.email}>
                        {row.email}
                      </p>
                      <p className="break-all text-xs text-slate-400">@{row.username}</p>
                      {row.flags.isSelf ? <Badge className="mt-1">You</Badge> : null}
                      {row.flags.protectedOwner ? (
                        <Badge className="mt-1 border-amber-500/40 text-amber-200">Protected owner</Badge>
                      ) : null}
                    </td>
                    <td className="p-3">
                      <Badge>{row.role}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge>{row.status}</Badge>
                    </td>
                    <td className="p-3 text-xs text-slate-300">
                      {row.policy ? (
                        <>
                          <p>{row.policy.assignedPlan}</p>
                          <p className="text-slate-500">
                            pkg {row.policy.packageTokensUsedThisMonth}/{row.policy.monthlyPackageTokenLimit} · keys{" "}
                            {row.policy.keysUsedThisMonth}/{row.policy.monthlyKeyLimit}
                          </p>
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-400">{row.hasLoginCredentials ? "Password" : "DB only"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" className="bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600" onClick={() => openEdit(row)}>
                          <Pencil className="mr-1 inline h-3 w-3" />
                          Edit
                        </Button>
                        {canDelete && !row.flags.protectedOwner && !row.flags.isSelf ? (
                          <Button
                            type="button"
                            className="bg-red-900/50 px-2 py-1 text-xs text-red-200 hover:bg-red-900/80"
                            onClick={() => setDeleteConfirm(row.email)}
                          >
                            <Trash2 className="mr-1 inline h-3 w-3" />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <Card className="p-6 text-center text-slate-500">Loading…</Card>
        ) : (
          filtered.map((row) => (
            <Card key={row.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all font-semibold text-white" title={row.email}>
                    {row.email}
                  </p>
                  <p className="text-xs text-slate-400">@{row.username}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge>{row.role}</Badge>
                  <Badge>{row.status}</Badge>
                </div>
              </div>
              {row.policy ? (
                <p className="text-xs text-slate-400">
                  {row.policy.assignedPlan} · pkg {row.policy.packageTokensUsedThisMonth}/{row.policy.monthlyPackageTokenLimit} · keys{" "}
                  {row.policy.keysUsedThisMonth}/{row.policy.monthlyKeyLimit}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" className="flex-1 bg-slate-700 text-xs hover:bg-slate-600" onClick={() => openEdit(row)}>
                  Edit
                </Button>
                {canDelete && !row.flags.protectedOwner && !row.flags.isSelf ? (
                  <Button type="button" className="flex-1 bg-red-900/50 text-xs text-red-200" onClick={() => setDeleteConfirm(row.email)}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </Card>
          ))
        )}
      </div>

      {editing?.policy ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-4">
            <h3 className="text-lg font-semibold">Edit account</h3>
            <p className="break-all text-sm text-slate-400">{editing.email}</p>
            <div className="mt-4 grid gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Role</label>
                <Select
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}
                >
                  <option value="viewer">viewer</option>
                  <option value="support">support</option>
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Status</label>
                <Select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value as AdminStatus })}
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="invited">invited</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Assigned plan (license tier)</label>
                <Select
                  value={editing.policy.assignedPlan}
                  onChange={(e) => {
                    const plan = e.target.value as LicensePlan;
                    const q = quotaForAssignedPlan(plan);
                    setPkgLimitStr(String(q.monthlyPackageTokenLimit));
                    setKeyLimitStr(String(q.monthlyKeyLimit));
                    setEditing({
                      ...editing,
                      policy: {
                        ...editing.policy!,
                        assignedPlan: plan,
                        monthlyPackageTokenLimit: q.monthlyPackageTokenLimit,
                        monthlyKeyLimit: q.monthlyKeyLimit,
                      },
                    });
                  }}
                >
                  <option value="basic">basic (3 pkg · 30 keys / tháng)</option>
                  <option value="pro">pro (10 pkg · 200 keys / tháng)</option>
                  <option value="premium">premium (50 pkg · 500 keys / tháng)</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Packages / month</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={pkgLimitStr}
                    onChange={(e) => setPkgLimitStr(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Keys / month</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={keyLimitStr}
                    onChange={(e) => setKeyLimitStr(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Access expires (optional)</label>
                <Input
                  type="datetime-local"
                  value={editing.policy.expiresAt ? editing.policy.expiresAt.slice(0, 16) : ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      policy: {
                        ...editing.policy!,
                        expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                      },
                    })
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button type="button" className="bg-slate-700 hover:bg-slate-600" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {deleteConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md p-4">
            <p className="font-medium text-white">Delete this account?</p>
            <p className="mt-2 break-all text-sm text-slate-400">{deleteConfirm}</p>
            <p className="mt-2 text-xs text-amber-200/90">Removes dashboard access and DB user (Supabase). Packages/licenses are not auto-deleted.</p>
            <div className="mt-4 flex gap-2">
              <Button type="button" className="bg-red-900/60 hover:bg-red-900" onClick={() => void doDelete(deleteConfirm)}>
                Delete permanently
              </Button>
              <Button type="button" className="bg-slate-700" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
