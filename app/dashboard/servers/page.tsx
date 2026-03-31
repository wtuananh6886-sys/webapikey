import { Card, Badge } from "@/components/ui-kit";
import { servers } from "@/lib/mock-data";

export default function ServersPage() {
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Servers</h1>
        <p className="text-sm text-slate-400">Theo dõi heartbeat, ping, trạng thái vận hành.</p>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="p-2">Name</th><th className="p-2">IP</th><th className="p-2">Region</th><th className="p-2">Status</th><th className="p-2">Ping</th><th className="p-2">Version</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id} className="border-t border-slate-800">
                <td className="p-2">{s.name}</td>
                <td className="p-2">{s.ip}</td>
                <td className="p-2">{s.region}</td>
                <td className="p-2"><Badge>{s.status}</Badge></td>
                <td className="p-2">{s.ping}ms</td>
                <td className="p-2">{s.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
