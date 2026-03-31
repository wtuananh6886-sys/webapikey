import { Card, Badge } from "@/components/ui-kit";
import { tweaks } from "@/lib/mock-data";

export default function TweaksPage() {
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Tweaks / Packages</h1>
        <p className="text-sm text-slate-400">Theo dõi package ID, version, channel và required plan.</p>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="p-2">Name</th><th className="p-2">Package ID</th><th className="p-2">Version</th><th className="p-2">Status</th><th className="p-2">Plan</th>
            </tr>
          </thead>
          <tbody>
            {tweaks.map((t) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="p-2">{t.name}</td>
                <td className="p-2">{t.packageId}</td>
                <td className="p-2">{t.currentVersion}</td>
                <td className="p-2"><Badge>{t.status}</Badge></td>
                <td className="p-2">{t.requiredPlan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
