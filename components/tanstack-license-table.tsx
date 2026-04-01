"use client";

import { useMemo, useState } from "react";
import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { Ban, Clock3, Copy, Pause, Play, RotateCcw, Trash2, Undo2, Unlock } from "lucide-react";
import { toast } from "sonner";
import type { License } from "@/types/domain";
import { fmtDate } from "@/lib/utils";
import { LicenseStatusBadge } from "@/components/license-status-badge";
import { Input, Select } from "@/components/ui-kit";

type LicenseAction =
  | "ban"
  | "revoke"
  | "extend"
  | "unban"
  | "unrevoke"
  | "activate"
  | "deactivate";

const ACTION_SUCCESS_VI: Partial<Record<LicenseAction, string>> = {
  ban: "Đã ban key",
  revoke: "Đã revoke key",
  extend: "Đã gia hạn key",
  unban: "Đã gỡ ban — key active lại",
  unrevoke: "Đã gỡ revoke — key active lại",
  activate: "Đã kích hoạt key (active)",
  deactivate: "Đã tạm dừng key (inactive)",
};

function ActionBtn({
  title,
  onClick,
  children,
  className = "",
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`touch-manipulation rounded-lg border border-slate-600/80 p-1.5 text-slate-200 transition hover:bg-slate-800 active:scale-[0.98] ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function TanstackLicenseTable({ data, onRefresh }: { data: License[]; onRefresh?: () => Promise<void> | void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(
    () =>
      data.filter((it) => {
        const qValue = q.toLowerCase();
        const qOk =
          it.key.toLowerCase().includes(qValue) ||
          it.name.toLowerCase().includes(qValue) ||
          (it.assignedUser ?? "").toLowerCase().includes(qValue);
        const sOk = status === "all" ? true : it.status === status;
        return qOk && sOk;
      }),
    [data, q, status]
  );

  const columns = useMemo<ColumnDef<License>[]>(
    () => [
      { accessorKey: "name", header: "Key Name" },
      { accessorKey: "packageName", header: "Package" },
      { accessorKey: "key", header: "Key" },
      { accessorKey: "keyMode", header: "Mode" },
      { accessorKey: "plan", header: "Plan" },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <LicenseStatusBadge status={row.original.status} /> },
      { accessorKey: "assignedUser", header: "Assigned User", cell: ({ row }) => row.original.assignedUser ?? "-" },
      { accessorKey: "deviceId", header: "Device", cell: ({ row }) => row.original.deviceId ?? "-" },
      { accessorKey: "maxDevices", header: "Max Devices" },
      { accessorKey: "expiresAt", header: "Expiry", cell: ({ row }) => fmtDate(row.original.expiresAt) },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const lic = row.original;

          const callAction = async (action: LicenseAction, extendDays?: number) => {
            const body: Record<string, unknown> = { id: lic.id, action };
            if (action === "extend") body.days = extendDays ?? 30;
            const res = await fetch("/api/licenses", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify(body),
            });
            const payload = (await res.json().catch(() => null)) as { message?: string } | null;
            if (!res.ok) {
              toast.error(payload?.message ?? `Thao tác thất bại (HTTP ${res.status})`);
              return;
            }
            toast.success(ACTION_SUCCESS_VI[action] ?? "Đã cập nhật");
            await onRefresh?.();
          };

          const promptExtend = () => {
            const raw = window.prompt("Gia hạn thêm bao nhiêu ngày? (1–365)", "30");
            if (raw === null) return;
            const n = parseInt(raw.trim(), 10);
            if (Number.isNaN(n) || n < 1 || n > 365) {
              toast.error("Số ngày không hợp lệ (1–365)");
              return;
            }
            void callAction("extend", n);
          };

          const deleteLicense = async () => {
            const confirmDelete = window.confirm(`Xóa key ${lic.key}? Hành động này không thể hoàn tác.`);
            if (!confirmDelete) return;
            const res = await fetch("/api/licenses", {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ id: lic.id }),
            });
            const payload = (await res.json().catch(() => null)) as { message?: string } | null;
            if (!res.ok) {
              toast.error(payload?.message ?? "Xóa key thất bại");
              return;
            }
            toast.success("Đã xóa key");
            await onRefresh?.();
          };

          const st = lic.status;

          return (
            <div className="flex max-w-[14rem] flex-wrap items-center gap-1 sm:max-w-none">
              <ActionBtn
                title="Copy key"
                onClick={() => {
                  void navigator.clipboard.writeText(lic.key);
                  toast.success("Đã copy key");
                }}
              >
                <Copy size={14} />
              </ActionBtn>

              {st === "active" && (
                <>
                  <ActionBtn title="Ban key (khóa cứng)" className="hover:bg-red-950/80" onClick={() => void callAction("ban")}>
                    <Ban size={14} />
                  </ActionBtn>
                  <ActionBtn title="Revoke key" className="hover:bg-amber-950/80" onClick={() => void callAction("revoke")}>
                    <RotateCcw size={14} />
                  </ActionBtn>
                  <ActionBtn title="Tạm dừng (inactive)" className="hover:bg-slate-700/80" onClick={() => void callAction("deactivate")}>
                    <Pause size={14} />
                  </ActionBtn>
                </>
              )}

              {st === "banned" && (
                <ActionBtn title="Gỡ ban — đặt active lại" className="hover:bg-emerald-950/80" onClick={() => void callAction("unban")}>
                  <Unlock size={14} />
                </ActionBtn>
              )}

              {st === "revoked" && (
                <ActionBtn title="Gỡ revoke — đặt active lại" className="hover:bg-emerald-950/80" onClick={() => void callAction("unrevoke")}>
                  <Undo2 size={14} />
                </ActionBtn>
              )}

              {st === "inactive" && (
                <ActionBtn title="Kích hoạt lại (active)" className="hover:bg-emerald-950/80" onClick={() => void callAction("activate")}>
                  <Play size={14} />
                </ActionBtn>
              )}

              <ActionBtn title="Gia hạn (+ ngày, hỏi số ngày)" className="hover:bg-cyan-950/50" onClick={promptExtend}>
                <Clock3 size={14} />
              </ActionBtn>

              <ActionBtn title="Xóa key vĩnh viễn" className="hover:bg-rose-950/80" onClick={() => void deleteLicense()}>
                <Trash2 size={14} />
              </ActionBtn>
            </div>
          );
        },
      },
    ],
    [onRefresh]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-2xl border bg-[#0e1524]/90 p-4">
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search key, name, user..." />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="expired">expired</option>
          <option value="banned">banned</option>
          <option value="revoked">revoked</option>
        </Select>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Ban / Revoke / Tạm dừng theo trạng thái. <span className="text-slate-400">Unban</span> và <span className="text-slate-400">Gỡ revoke</span> chỉ hiện khi key đang banned/revoked.
        Gia hạn: key <span className="text-slate-400">expired</span> hoặc <span className="text-slate-400">inactive</span> sẽ được đặt lại <span className="text-slate-400">active</span> sau khi gia hạn.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-2 py-2 font-medium">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-2 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
