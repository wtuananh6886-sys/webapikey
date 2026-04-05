import { NextResponse } from "next/server";
import { z } from "zod";
import { monthTag } from "@/lib/account-policy";
import { accountPolicies, admins, adminCredentials } from "@/lib/mock-data";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";
import { hashPassword } from "@/lib/password-hash";
import type { AdminUser, Role } from "@/types/domain";

const RegisterSchema = z.object({
  username: z.string().min(3).max(40),
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

export async function POST(req: Request) {
  if (process.env.VERCEL === "1" && !isSupabaseEnabled()) {
    return NextResponse.json(
      {
        message:
          "Persistence chưa được bật trên production. Hãy cấu hình NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trên Vercel trước khi tạo tài khoản.",
      },
      { status: 503 }
    );
  }
  const payload = await req.json();
  const parsed = RegisterSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const email = data.email.trim().toLowerCase();
  const usernameNorm = data.username.trim().toLowerCase();
  const exists = adminCredentials.some((it) => it.email.toLowerCase() === email);
  if (exists) {
    return NextResponse.json({ message: "Email already registered" }, { status: 409 });
  }

  /** support = tạo package/key, servers, tweaks (theo quota gói). viewer chỉ Overview+Logs — không phù hợp user tự đăng ký. */
  const selectedRole: Role = "support";
  if (!isSupabaseEnabled()) {
    adminCredentials.push({
      email,
      password: data.password,
      username: usernameNorm,
      role: selectedRole,
    });
  }

  const now = new Date().toISOString();
  const hashedPassword = hashPassword(data.password);
  const profile: AdminUser = {
    id: `adm_${Date.now()}`,
    username: usernameNorm,
    email,
    role: selectedRole,
    status: "active",
    lastLogin: null,
    createdAt: now,
  };
  admins.unshift(profile);
  accountPolicies.push({
    email,
    role: selectedRole,
    assignedPlan: "basic",
    monthlyPackageTokenLimit: 3,
    monthlyKeyLimit: 30,
    packageTokensUsedThisMonth: 0,
    keysUsedThisMonth: 0,
    expiresAt: null,
    updatedAt: now,
  });

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: existingByEmail } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
      if (existingByEmail) {
        return NextResponse.json({ message: "Email already registered" }, { status: 409 });
      }
      const { data: existingUsername } = await supabase
        .from("admin_profiles")
        .select("id")
        .eq("username", usernameNorm)
        .maybeSingle();
      if (existingUsername) {
        return NextResponse.json({ message: "Username already registered" }, { status: 409 });
      }

      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .insert({ email, password_hash: hashedPassword })
        .select("id")
        .single();
      if (userErr || !userRow) {
        return NextResponse.json({ message: userErr?.message ?? "register_insert_user_failed" }, { status: 500 });
      }

      const { error: profileErr } = await supabase.from("admin_profiles").insert({
        user_id: userRow.id,
        username: usernameNorm,
        role: selectedRole,
        status: "active",
      });
      if (profileErr) {
        return NextResponse.json({ message: profileErr.message }, { status: 500 });
      }

      const { error: policyErr } = await supabase.from("account_policies").upsert(
        {
          email,
          role: selectedRole,
          assigned_plan: "basic",
          monthly_package_token_limit: 3,
          monthly_key_limit: 30,
          package_tokens_used_this_month: 0,
          keys_used_this_month: 0,
          usage_month: monthTag(),
          expires_at: null,
          updated_at: now,
        },
        { onConflict: "email" }
      );
      if (policyErr) {
        return NextResponse.json({ message: policyErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, role: selectedRole });
}
