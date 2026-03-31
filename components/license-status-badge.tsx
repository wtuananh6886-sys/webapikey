import type { LicenseStatus } from "@/types/domain";
import { Badge } from "@/components/ui-kit";

const styleMap: Record<LicenseStatus, string> = {
  active: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  inactive: "border-slate-400/40 bg-slate-400/10 text-slate-200",
  expired: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  banned: "border-red-400/40 bg-red-400/10 text-red-300",
  revoked: "border-rose-400/40 bg-rose-400/10 text-rose-300",
};

export function LicenseStatusBadge({ status }: { status: LicenseStatus }) {
  return <Badge className={styleMap[status]}>{status}</Badge>;
}
