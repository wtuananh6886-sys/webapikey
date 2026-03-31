import { NextResponse } from "next/server";
import { z } from "zod";
import { admins, adminCredentials } from "@/lib/mock-data";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";
import type { AdminUser, Role } from "@/types/domain";

const RegisterSchema = z.object({
  username: z.string().min(3).max(40),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  role: z.enum(["owner", "admin", "support", "viewer"]).optional(),
});

export async function POST(req: Request) {
  const payload = await req.json();
  const parsed = RegisterSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const email = data.email.trim().toLowerCase();
  const exists = adminCredentials.some((it) => it.email.toLowerCase() === email);
  if (exists) {
    return NextResponse.json({ message: "Email already registered" }, { status: 409 });
  }

  const selectedRole: Role = data.role ?? "viewer";
  adminCredentials.push({
    email,
    password: data.password,
    username: data.username,
    role: selectedRole,
  });

  const now = new Date().toISOString();
  const profile: AdminUser = {
    id: `adm_${Date.now()}`,
    username: data.username,
    email,
    role: selectedRole,
    status: "active",
    lastLogin: null,
    createdAt: now,
  };
  admins.unshift(profile);

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .insert({ email })
        .select("id")
        .single();
      if (!userErr && userRow) {
        await supabase.from("admin_profiles").insert({
          user_id: userRow.id,
          username: data.username,
          role: selectedRole,
          status: "active",
        });
      }
    }
  }

  const response = NextResponse.json({ ok: true, role: selectedRole });
  response.cookies.set("wa_role", selectedRole, { httpOnly: true, path: "/" });
  response.cookies.set("wa_email", email, { httpOnly: true, path: "/" });
  return response;
}
