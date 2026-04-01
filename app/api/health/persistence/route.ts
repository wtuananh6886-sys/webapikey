import { NextResponse } from "next/server";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

export async function GET() {
  const enabled = isSupabaseEnabled();
  if (!enabled) {
    return NextResponse.json(
      {
        ok: false,
        mode: "mock",
        message: "Supabase env is missing",
        checks: { env: false, db: false, schema: false },
      },
      { status: 200 }
    );
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        mode: "mock",
        message: "Supabase client unavailable",
        checks: { env: true, db: false, schema: false },
      },
      { status: 200 }
    );
  }

  try {
    const [{ error: pkgErr }, { error: licErr }, { error: polErr }] = await Promise.all([
      supabase.from("user_packages").select("id", { head: true, count: "exact" }),
      supabase.from("licenses").select("id", { head: true, count: "exact" }),
      supabase.from("account_policies").select("email", { head: true, count: "exact" }),
    ]);

    const schemaOk = !pkgErr && !licErr && !polErr;
    return NextResponse.json({
      ok: schemaOk,
      mode: "supabase",
      message: schemaOk ? "Persistence enabled" : "Schema check failed",
      checks: {
        env: true,
        db: true,
        schema: schemaOk,
      },
      errors: {
        user_packages: pkgErr?.message ?? null,
        licenses: licErr?.message ?? null,
        account_policies: polErr?.message ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      mode: "supabase",
      message: "Persistence check failed",
      checks: { env: true, db: false, schema: false },
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
