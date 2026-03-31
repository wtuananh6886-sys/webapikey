import { Card, Badge, Input } from "@/components/ui-kit";
import { logs } from "@/lib/mock-data";

export default function LogsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Activity Logs</h1>
        <p className="text-sm text-slate-400">Login logs, key logs, server logs, tweak logs, admin actions.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <Input placeholder="Filter actor..." />
          <Input placeholder="Filter action..." />
          <Input placeholder="Filter severity..." />
        </div>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="p-2">Actor</th><th className="p-2">Action</th><th className="p-2">Target</th><th className="p-2">IP</th><th className="p-2">Severity</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-slate-800">
                <td className="p-2">{l.actor}</td>
                <td className="p-2">{l.action}</td>
                <td className="p-2">{l.targetName}</td>
                <td className="p-2">{l.ip}</td>
                <td className="p-2"><Badge>{l.severity}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
