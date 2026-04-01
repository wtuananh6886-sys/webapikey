import { LicensesManager } from "@/components/licenses-manager";
import { Card } from "@/components/ui-kit";

export default function LicensesPage() {
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Licenses / Keys</h1>
        <p className="text-sm text-slate-400">
          Quan ly key, trang thai, device bind va expiry. Danh sach luon lay tu API sau khi mo trang (dong bo voi Supabase / server).
        </p>
      </Card>
      <LicensesManager />
    </div>
  );
}
