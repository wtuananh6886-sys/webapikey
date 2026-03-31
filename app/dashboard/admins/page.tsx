import { Card, Badge } from "@/components/ui-kit";
import { admins } from "@/lib/mock-data";

export default function AdminsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Admin Users</h1>
        <p className="text-sm text-slate-400">Phân quyền owner/admin/support/viewer và theo dõi trạng thái.</p>
      </Card>
      <Card>
        <h2 className="mb-3 text-base font-semibold">Permission Matrix</h2>
        <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
          <p><span className="font-medium text-white">owner:</span> full access (users, settings, security, billing).</p>
          <p><span className="font-medium text-white">admin:</span> manage licenses, tweaks, servers, logs.</p>
          <p><span className="font-medium text-white">support:</span> view all + support actions for license/device issues.</p>
          <p><span className="font-medium text-white">viewer:</span> dashboard/log read-only, no mutation actions.</p>
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 text-base font-semibold">Admin Contact</h2>
        <p className="text-sm text-slate-300">
          Owner: <span className="font-semibold text-white">tuananh</span> - Telegram:{" "}
          <a className="text-cyan-300 underline-offset-2 hover:underline" href="https://t.me/wtuananh6886" target="_blank" rel="noreferrer">
            @wtuananh6886
          </a>
        </p>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="p-2">Username</th><th className="p-2">Email</th><th className="p-2">Role</th><th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-t border-slate-800">
                <td className="p-2">{a.username}</td>
                <td className="p-2">{a.email}</td>
                <td className="p-2"><Badge>{a.role}</Badge></td>
                <td className="p-2"><Badge>{a.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
