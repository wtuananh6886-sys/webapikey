import { NextResponse } from "next/server";
import { mapPolicyRowToApi } from "@/lib/account-policy";
import { accountPolicies, adminCredentials, admins, userPackages } from "@/lib/mock-data";
import { getWaSession } from "@/lib/session-cookies";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

function slugifyPackageName(input: string) {
  const base = input.split("@")[0] ?? input;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default-package";
}

export async function GET() {
  const session = await getWaSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { role, email, username: sessionUsername } = session;
  let username = sessionUsername;
  if (!username) {
    const cred = adminCredentials.find((c) => c.email.toLowerCase() === email.toLowerCase());
    username = cred?.username ?? email.split("@")[0] ?? "user";
  }

  const personalPackage = slugifyPackageName(email);
  let currentPackage =
    role === "owner" || role === "admin" ? "premium-admin" : role === "support" ? "support-console" : "viewer";
  let packages: string[] = [];
  let policy: ReturnType<typeof mapPolicyRowToApi> | null = null;
  let accountCreatedAt: string | null = null;

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: userRow } = await supabase
        .from("users")
        .select("id, created_at")
        .eq("email", email.toLowerCase())
        .maybeSingle();
      if (userRow?.created_at) {
        accountCreatedAt = userRow.created_at as string;
      }
      if (userRow?.id) {
        const { data: prof } = await supabase
          .from("admin_profiles")
          .select("username, created_at")
          .eq("user_id", userRow.id)
          .maybeSingle();
        if (prof?.username && String(prof.username).trim().length > 0) {
          username = String(prof.username).trim();
        }
        if (!accountCreatedAt && prof?.created_at) {
          accountCreatedAt = prof.created_at as string;
        }
      }

      const query = supabase
        .from("user_packages")
        .select("name")
        .eq("status", "active")
        .order("created_at", { ascending: false });
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
        ? userPackages.filter((pkg) => pkg.status === "active")
        : userPackages.filter((pkg) => pkg.ownerEmail === email.toLowerCase() && pkg.status === "active");
    packages = accessiblePackages.length > 0 ? accessiblePackages.map((pkg) => pkg.name) : [personalPackage];
  }

  if (!accountCreatedAt) {
    const mockProfile = admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
    accountCreatedAt = mockProfile?.createdAt ?? null;
  }

  if (policy && role !== "owner" && role !== "admin") {
    currentPackage = `Gói ${policy.assignedPlan}`;
  }

  return NextResponse.json({ role, currentPackage, email, username, packages, policy, accountCreatedAt });
}
