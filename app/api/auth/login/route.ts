import { NextResponse } from "next/server";
import { ensureAccountPolicyOnLogin } from "@/lib/account-policy";
import {
  getWaSessionSecretBytes,
  signWaSessionJwt,
  waSessionTtlSec,
} from "@/lib/admin-session-jwt";
import { adminCredentials } from "@/lib/mock-data";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";
import { verifyPassword } from "@/lib/password-hash";

/** ILIKE đúng một chuỗi (không wildcard). Escape % _ \ để tránh khớp sai. */
function ilikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string; identifier?: string; password?: string };
  const raw = (body.identifier ?? body.email ?? "").trim();
  const password = String(body.password ?? "").trim();
  if (!raw || !password) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });

  const key = raw.toLowerCase();
  let role: "owner" | "admin" | "support" | "viewer" | null = null;
  let emailNorm = "";
  let username = "";

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      type ProfileRow = {
        username: string;
        role: "owner" | "admin" | "support" | "viewer";
      };

      let user: { id: string; email: string; password_hash: string | null } | null = null;
      let profile: ProfileRow | null = null;

      if (key.includes("@")) {
        const pickUser = (row: { id: unknown; email: unknown; password_hash: unknown } | null) => {
          if (!row) return;
          user = {
            id: String(row.id),
            email: String(row.email),
            password_hash: (row.password_hash as string | null) ?? null,
          };
        };

        const { data: byEq, error: errEq } = await supabase
          .from("users")
          .select("id, email, password_hash")
          .eq("email", key)
          .maybeSingle();
        if (errEq) {
          console.error("[login] users eq email:", errEq.message);
          return NextResponse.json(
            { message: "Không truy vấn được bảng users. Kiểm tra SUPABASE_SERVICE_ROLE_KEY và URL project." },
            { status: 503 }
          );
        }
        pickUser(byEq as { id: unknown; email: unknown; password_hash: unknown } | null);

        if (!user) {
          const { data: byIlike, error: errIlike } = await supabase
            .from("users")
            .select("id, email, password_hash")
            .ilike("email", ilikeExact(key.trim()))
            .limit(1)
            .maybeSingle();
          if (errIlike) {
            console.error("[login] users ilike email:", errIlike.message);
            return NextResponse.json(
              { message: "Không truy vấn được bảng users. Kiểm tra Supabase." },
              { status: 503 }
            );
          }
          pickUser(byIlike as { id: unknown; email: unknown; password_hash: unknown } | null);
        }

        if (!user) {
          return NextResponse.json(
            {
              message:
                "Không có dòng nào trong bảng public.users với email này. Chỉ có account_policies là không đủ để đăng nhập. Cách làm: (1) Table Editor → users → Insert: email đúng Gmail + password_hash (scrypt$...), (2) admin_profiles: user_id = id users đó, role = owner. Hoặc xóa email khỏi users nếu trùng rồi Đăng ký lại trên web.",
            },
            { status: 401 }
          );
        }
      } else {
        const { data: p, error: profErr } = await supabase
          .from("admin_profiles")
          .select("user_id, username, role")
          .eq("username", key)
          .maybeSingle();
        if (profErr) {
          console.error("[login] admin_profiles by username:", profErr.message);
          return NextResponse.json(
            { message: "Không truy vấn được admin_profiles. Kiểm tra Supabase." },
            { status: 503 }
          );
        }
        if (p?.user_id) {
          profile = {
            username: String(p.username),
            role: (p.role as ProfileRow["role"]) ?? "viewer",
          };
          const { data: u, error: uErr } = await supabase
            .from("users")
            .select("id, email, password_hash")
            .eq("id", p.user_id)
            .maybeSingle();
          if (uErr) {
            console.error("[login] users by id:", uErr.message);
            return NextResponse.json({ message: "Lỗi đọc user. Kiểm tra Supabase." }, { status: 503 });
          }
          if (u) {
            user = {
              id: String(u.id),
              email: String(u.email),
              password_hash: (u.password_hash as string | null) ?? null,
            };
          }
        }
      }

      if (user && !String(user.password_hash ?? "").trim()) {
        return NextResponse.json(
          {
            message:
              "Tài khoản tồn tại nhưng chưa có mật khẩu (password_hash trống). Hãy đăng ký lại cùng email hoặc cập nhật cột password_hash trong Supabase (định dạng scrypt$... từ app Đăng ký).",
          },
          { status: 401 }
        );
      }

      if (user?.password_hash) {
        const hash = String(user.password_hash).trim();
        const looksScrypt = hash.startsWith("scrypt$");
        if (!looksScrypt) {
          return NextResponse.json(
            {
              message:
                "Tài khoản này có password_hash không đúng định dạng app (cần chuỗi bắt đầu bằng scrypt$). Owner tạo tay trong Supabase thường gặp lỗi này. Cách xử lý: (1) Xóa dòng users + admin_profiles rồi Đăng ký lại cùng email, hoặc (2) chạy script scripts/print-scrypt.mjs để tạo hash mới rồi UPDATE cột password_hash trong Supabase.",
            },
            { status: 401 }
          );
        }
        const ok = verifyPassword(password, hash);
        if (!ok) {
          const devHint =
            process.env.NODE_ENV === "development"
              ? " Mật khẩu phải trùng đúng chuỗi đã dùng khi chạy npm run hash-password. Kiểm tra: node scripts/verify-scrypt.mjs \"MAT_KHAU\" \"scrypt$...\" (dán nguyên hash từ Supabase)."
              : "";
          return NextResponse.json({ message: `Invalid credentials.${devHint}` }, { status: 401 });
        }

        if (!profile) {
          const { data: p } = await supabase
            .from("admin_profiles")
            .select("username, role")
            .eq("user_id", user.id)
            .maybeSingle();
          if (p) {
            profile = {
              username: String(p.username),
              role: (p.role as ProfileRow["role"]) ?? "viewer",
            };
          }
        }

        emailNorm = user.email.toLowerCase();
        username = profile?.username?.trim() || emailNorm.split("@")[0] || "user";
        role = profile?.role ?? "viewer";
      }
    }
  }

  if (!role) {
    const account = adminCredentials.find(
      (it) =>
        (it.email.toLowerCase() === key || it.username.toLowerCase() === key) && it.password === password
    );
    if (!account) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }
    role = account.role;
    emailNorm = account.email.toLowerCase();
    username = account.username.trim();
  }

  if (!role) {
    return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
  }

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      try {
        await ensureAccountPolicyOnLogin(supabase, emailNorm, role);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "policy_sync_failed";
        return NextResponse.json({ message: msg }, { status: 500 });
      }
    }
  }

  const secret = getWaSessionSecretBytes();
  if (!secret) {
    return NextResponse.json(
      {
        message:
          "Cấu hình server thiếu WA_SESSION_SECRET (tối thiểu 16 ký tự). Tạo bằng: openssl rand -base64 32",
      },
      { status: 503 }
    );
  }

  const ttl = waSessionTtlSec();
  const token = await signWaSessionJwt({ email: emailNorm, role, username }, secret, ttl);

  const cookieBase = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: ttl,
  };

  const response = NextResponse.json({ ok: true, email: emailNorm, username });
  response.cookies.set("wa_session", token, cookieBase);
  response.cookies.set("wa_role", "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set("wa_email", "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set("wa_username", "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
