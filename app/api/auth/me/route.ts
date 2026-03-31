import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { userPackages } from "@/lib/mock-data";
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
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const query = supabase.from("user_packages").select("name").order("created_at", { ascending: false });
      const { data } =
        role === "owner" || role === "admin"
          ? await query
          : await query.eq("owner_email", email.toLowerCase());
      packages = (data ?? []).map((item) => item.name);
    }
  }
  if (packages.length === 0) {
    const accessiblePackages =
      role === "owner" || role === "admin"
        ? userPackages
        : userPackages.filter((pkg) => pkg.ownerEmail === email.toLowerCase());
    packages = accessiblePackages.length > 0 ? accessiblePackages.map((pkg) => pkg.name) : [personalPackage];
  }

  return NextResponse.json({ role, currentPackage, email, packages });
}
