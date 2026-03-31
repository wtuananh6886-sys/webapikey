import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { userPackages } from "@/lib/mock-data";
import type { UserPackage } from "@/types/domain";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

const CreatePackageSchema = z.object({
  name: z.string().min(2).max(80),
});

function generatePackageToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "PKG_";
  for (let i = 0; i < 16; i += 1) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function normalizePackageName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getAuthContext() {
  const cookieStore = await cookies();
  const role = cookieStore.get("wa_role")?.value ?? "viewer";
  const email = (cookieStore.get("wa_email")?.value ?? "viewer@local").toLowerCase();
  return { role, email };
}

export async function GET() {
  const { role, email } = await getAuthContext();
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const query = supabase.from("user_packages").select("*").order("created_at", { ascending: false });
      const { data, error } =
        role === "owner" || role === "admin" ? await query : await query.eq("owner_email", email);
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      const rows = data ?? [];
      const missingTokenRows = rows.filter((row) => !row.token);
      if (missingTokenRows.length > 0) {
        for (const row of missingTokenRows) {
          await supabase
            .from("user_packages")
            .update({ token: generatePackageToken() })
            .eq("id", row.id);
        }
      }
      const { data: refreshed, error: refreshError } =
        role === "owner" || role === "admin"
          ? await query
          : await query.eq("owner_email", email);
      if (refreshError) return NextResponse.json({ message: refreshError.message }, { status: 500 });
      const mapped = (refreshed ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        token: row.token,
        ownerEmail: row.owner_email,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      return NextResponse.json({ data: mapped });
    }
  }
  const rows =
    role === "owner" || role === "admin"
      ? userPackages
      : userPackages.filter((pkg) => pkg.ownerEmail === email);
  return NextResponse.json({ data: rows });
}

export async function POST(req: Request) {
  const { email } = await getAuthContext();
  const payload = await req.json();
  const parsed = CreatePackageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const normalized = normalizePackageName(parsed.data.name);
  if (!normalized) return NextResponse.json({ message: "Invalid package name" }, { status: 400 });
  const existed = userPackages.some((pkg) => pkg.name === normalized);
  if (existed) return NextResponse.json({ message: "Package already exists" }, { status: 409 });

  const now = new Date().toISOString();
  const created: UserPackage = {
    id: `pkg_${Date.now()}`,
    name: normalized,
    token: generatePackageToken(),
    ownerEmail: email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("user_packages")
        .insert({
          name: created.name,
          token: created.token,
          owner_email: created.ownerEmail,
          status: created.status,
        })
        .select("*")
        .single();
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      return NextResponse.json(
        {
          data: {
            id: data.id,
            name: data.name,
            token: data.token,
            ownerEmail: data.owner_email,
            status: data.status,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          } satisfies UserPackage,
        },
        { status: 201 }
      );
    }
  }
  userPackages.unshift(created);
  return NextResponse.json({ data: created }, { status: 201 });
}

