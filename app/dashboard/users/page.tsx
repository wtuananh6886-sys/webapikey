import { Card } from "@/components/ui-kit";
import { UsersManager } from "@/components/users-manager";

export default function UsersPage() {
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-sm text-slate-400">
          Central directory of every registered account. Use <strong className="text-slate-300">Edit</strong> to upgrade plan, quotas, role, or
          suspend access. <strong className="text-slate-300">Delete</strong> is restricted to the owner and never applies to your own session or the
          last owner account.
        </p>
      </Card>
      <UsersManager />
    </div>
  );
}
