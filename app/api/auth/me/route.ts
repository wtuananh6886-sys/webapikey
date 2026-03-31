import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { accountPolicies, userPackages } from "@/lib/mock-data";
import { mapPolicyRowToApi } from "@/lib/account-policy";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

function slugifyPackageName(input: string) {
  const base = input.split("@")[0] ?? input;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default-package";
}

export async function GET() {
  const cookieStore = await cookies();
  const role = cookieStore.get("wa_role")?.value ?? "viewer";
  const email = cookieStore.get("wa_email")?.value ?? "viewer@local";
  const personalPackage = slugifyPackageName(email);
  const currentPackage = role === "owner" || role === "admin" ? "premium-admin" : role === "support" ? "support" : "viewer";
  let packages: string[] = [];
  let policy: ReturnType<typeof mapPolicyRowToApi> | null = null;

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const query = supabase.from("user_packages").select("name").order("created_at", { ascending: false });
      const { data } =
        role === "owner" || role === "admin"
          ? await query
          : await query.eq("owner_email", email.toLowerCase());
      packages = (data ?? []).map((item) => item.name);

      const { data: policyRow } = await supabase
        .from("account_policies")
        .select("*")
        .eq("email", email.toLowerCase())
        .maybeSingle();
      if (policyRow) policy = mapPolicyRowToApi(policyRow);
    }
  }
  if (!policy) {
    const mock = accountPolicies.find((p) => p.email.toLowerCase() === email.toLowerCase());
    if (mock) {
      policy = {
        assignedPlan: mock.assignedPlan,
        monthlyPackageTokenLimit: mock.monthlyPackageTokenLimit,
        monthlyKeyLimit: mock.monthlyKeyLimit,
        packageTokensUsedThisMonth: mock.packageTokensUsedThisMonth,
        keysUsedThisMonth: mock.keysUsedThisMonth,
        expiresAt: mock.expiresAt,
        usageMonth: undefined,
      };
    }
  }
  if (packages.length === 0) {
    const accessiblePackages =
      role === "owner" || role === "admin"
        ? userPackages
        : userPackages.filter((pkg) => pkg.ownerEmail === email.toLowerCase());
    packages = accessiblePackages.length > 0 ? accessiblePackages.map((pkg) => pkg.name) : [personalPackage];
  }

  return NextResponse.json({ role, currentPackage, email, packages, policy });
}
