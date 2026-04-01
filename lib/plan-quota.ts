import type { LicensePlan } from "@/types/domain";

/** Monthly limits by assigned plan (dashboard). Owner role bypasses in API routes. */
export function quotaForAssignedPlan(plan: LicensePlan): {
  monthlyPackageTokenLimit: number;
  monthlyKeyLimit: number;
} {
  switch (plan) {
    case "pro":
      return { monthlyPackageTokenLimit: 10, monthlyKeyLimit: 200 };
    case "premium":
      return { monthlyPackageTokenLimit: 50, monthlyKeyLimit: 500 };
    case "basic":
    default:
      return { monthlyPackageTokenLimit: 3, monthlyKeyLimit: 30 };
  }
}
