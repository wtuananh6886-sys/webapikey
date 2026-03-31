"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Select } from "@/components/ui-kit";

type Row = {
  admin: { id: string; username: string; email: string; role: string; status: string };
  policy: {
    assignedPlan: "basic" | "pro" | "premium";
    monthlyPackageTokenLimit: number;
    monthlyKeyLimit: number;
    packageTokensUsedThisMonth: number;
    keysUsedThisMonth: number;
    expiresAt: string | null;
  } | null;
};

export default function AdminsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/policies", { method: "GET" });
    if (!res.ok) return;
    const body = (await res.json()) as { data: Row[] };
    setRows(body.data);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (row: Row) => {
    setSavingEmail(row.admin.email);
    const payload = {
      email: row.admin.email,
      assignedPlan: row.policy?.assignedPlan ?? "basic",
      monthlyPackageTokenLimit: row.policy?.monthlyPackageTokenLimit ?? 0,
      monthlyKeyLimit: row.policy?.monthlyKeyLimit ?? 0,
      expiresAt: row.policy?.expiresAt ? new Date(row.policy.expiresAt).toISOString() : null,
    };
    const res = await fetch("/api/admin/policies", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSavingEmail(null);
    if (!res.ok) {
      toast.error("Failed to update policy");
      return;
    }
    toast.success("Policy updated");
    await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Admin Control Center</h1>
        <p className="text-sm text-slate-400">Owner/Admin can manage viewer plan, key quota, package token quota, and access expiry.</p>
      </Card>
      <Card>
        <h2 className="mb-3 text-base font-semibold">Role Power</h2>
        <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
          <p><span className="font-medium text-white">owner/admin:</span> full access, can assign viewer plan and monthly quotas.</p>
          <p><span className="font-medium text-white">support/viewer:</span> restricted by policy and quota limits.</p>
        </div>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="p-2">User</th>
              <th className="p-2">Role</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Token Quota / Used</th>
              <th className="p-2">Key Quota / Used</th>
              <th className="p-2">Expires At</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.admin.id} className="border-t border-slate-800 align-top">
                <td className="p-2">
                  <p className="font-medium text-white">{row.admin.username}</p>
                  <p className="text-xs text-slate-400">{row.admin.email}</p>
                </td>
                <td className="p-2">
                  <Badge>{row.admin.role}</Badge>
                </td>
                <td className="p-2">
                  <Select
                    value={row.policy?.assignedPlan ?? "basic"}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((it, i) =>
                          i === idx
                            ? {
                                ...it,
                                policy: {
                                  ...(it.policy ?? {
                                    assignedPlan: "basic",
                                    monthlyPackageTokenLimit: 0,
                                    monthlyKeyLimit: 0,
                                    packageTokensUsedThisMonth: 0,
                                    keysUsedThisMonth: 0,
                                    expiresAt: null,
                                  }),
                                  assignedPlan: e.target.value as "basic" | "pro" | "premium",
                                },
                              }
                            : it
                        )
                      )
                    }
                  >
                    <option value="basic">basic</option>
                    <option value="pro">pro</option>
                    <option value="premium">premium</option>
                  </Select>
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    value={row.policy?.monthlyPackageTokenLimit ?? 0}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((it, i) =>
                          i === idx
                            ? {
                                ...it,
                                policy: {
                                  ...(it.policy ?? {
                                    assignedPlan: "basic",
                                    monthlyPackageTokenLimit: 0,
                                    monthlyKeyLimit: 0,
                                    packageTokensUsedThisMonth: 0,
                                    keysUsedThisMonth: 0,
                                    expiresAt: null,
                                  }),
                                  monthlyPackageTokenLimit: Number(e.target.value) || 0,
                                },
                              }
                            : it
                        )
                      )
                    }
                  />
                  <p className="mt-1 text-xs text-slate-500">Used: {row.policy?.packageTokensUsedThisMonth ?? 0}</p>
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    value={row.policy?.monthlyKeyLimit ?? 0}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((it, i) =>
                          i === idx
                            ? {
                                ...it,
                                policy: {
                                  ...(it.policy ?? {
                                    assignedPlan: "basic",
                                    monthlyPackageTokenLimit: 0,
                                    monthlyKeyLimit: 0,
                                    packageTokensUsedThisMonth: 0,
                                    keysUsedThisMonth: 0,
                                    expiresAt: null,
                                  }),
                                  monthlyKeyLimit: Number(e.target.value) || 0,
                                },
                              }
                            : it
                        )
                      )
                    }
                  />
                  <p className="mt-1 text-xs text-slate-500">Used: {row.policy?.keysUsedThisMonth ?? 0}</p>
                </td>
                <td className="p-2">
                  <Input
                    type="datetime-local"
                    value={row.policy?.expiresAt ? row.policy.expiresAt.slice(0, 16) : ""}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((it, i) =>
                          i === idx
                            ? {
                                ...it,
                                policy: {
                                  ...(it.policy ?? {
                                    assignedPlan: "basic",
                                    monthlyPackageTokenLimit: 0,
                                    monthlyKeyLimit: 0,
                                    packageTokensUsedThisMonth: 0,
                                    keysUsedThisMonth: 0,
                                    expiresAt: null,
                                  }),
                                  expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                                },
                              }
                            : it
                        )
                      )
                    }
                  />
                </td>
                <td className="p-2">
                  <Button disabled={savingEmail === row.admin.email} onClick={() => void save(row)}>
                    {savingEmail === row.admin.email ? "Saving..." : "Save Policy"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
