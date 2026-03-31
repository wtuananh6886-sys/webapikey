"use client";

import { useMemo, useState } from "react";
import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { Copy, Ban, RotateCcw, Clock3, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { License } from "@/types/domain";
import { fmtDate } from "@/lib/utils";
import { LicenseStatusBadge } from "@/components/license-status-badge";
import { Input, Select } from "@/components/ui-kit";

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
          const callAction = async (action: "ban" | "revoke" | "extend") => {
            const body: Record<string, unknown> = { id: lic.id, action };
            if (action === "extend") body.days = 7;
            const res = await fetch("/api/licenses", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              toast.error("Action failed");
              return;
            }
            toast.success(`Action ${action} ok`);
            await onRefresh?.();
          };
          const deleteLicense = async () => {
            const confirmDelete = window.confirm(`Xoa key ${lic.key}? Hanh dong nay khong the hoan tac.`);
            if (!confirmDelete) return;
            const res = await fetch("/api/licenses", {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: lic.id }),
            });
            if (!res.ok) {
              toast.error("Xoa key that bai");
              return;
            }
            toast.success("Da xoa key");
            await onRefresh?.();
          };
          return (
            <div className="flex items-center gap-1">
              <button
                className="rounded-lg border p-1.5 hover:bg-slate-800"
                onClick={() => {
                  navigator.clipboard.writeText(lic.key);
                  toast.success("Đã copy key");
                }}
              >
                <Copy size={14} />
              </button>
              <button className="rounded-lg border p-1.5 hover:bg-red-950" onClick={() => callAction("ban")}>
                <Ban size={14} />
              </button>
              <button className="rounded-lg border p-1.5 hover:bg-amber-950" onClick={() => callAction("revoke")}>
                <RotateCcw size={14} />
              </button>
              <button className="rounded-lg border p-1.5 hover:bg-emerald-950" onClick={() => callAction("extend")}>
                <Clock3 size={14} />
              </button>
              <button className="rounded-lg border p-1.5 hover:bg-rose-950" onClick={deleteLicense}>
                <Trash2 size={14} />
              </button>
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
                  <td key={cell.id} className="px-2 py-2">
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
