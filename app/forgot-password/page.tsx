import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { buttonVariants } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { KeyRound, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Khôi phục quyền truy cập an toàn."
      description="Ứng dụng này dùng xác thực do admin cấu hình. Nếu quên mật khẩu, luồng reset có thể do quản trị viên hỗ trợ hoặc cập nhật trực tiếp trên Supabase."
    >
      <div
        id="main-content"
        tabIndex={-1}
        className="auth-card-enter nexora-frame relative w-full max-w-md p-6 sm:p-8"
      >
        <div className="relative z-[1]">
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--teal)]">Bảo mật</p>
          <h1 className="font-display mt-3 text-[1.75rem] leading-tight text-[var(--foreground)] sm:text-[2rem]">
            Quên mật khẩu
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            Hiện chưa có luồng tự phục hồi email tự động trên phiên bản này. Dùng một trong các cách dưới đây để
            lấy lại quyền đăng nhập.
          </p>
        </div>

        <ul className="space-y-3 text-sm text-[var(--foreground-secondary)]">
          <li className="flex gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
            <span>
              <span className="font-medium text-[var(--foreground)]">Liên hệ admin / owner</span>
              <span className="mt-1 block text-[var(--foreground-muted)]">
                Họ có thể reset mật khẩu hoặc cấp tài khoản mới qua dashboard Users.
              </span>
            </span>
          </li>
          <li className="flex gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
            <span>
              <span className="font-medium text-[var(--foreground)]">Supabase (developer)</span>
              <span className="mt-1 block text-[var(--foreground-muted)]">
                Cập nhật cột <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-xs">password_hash</code>{" "}
                trong <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-xs">public.users</code> bằng hash{" "}
                <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-xs">scrypt$…</code> từ script{" "}
                <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-xs">print-scrypt</code>.
              </span>
            </span>
          </li>
        </ul>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full justify-center sm:w-auto")}
          >
            Quay lại đăng nhập
          </Link>
        </div>
        </div>
      </div>
    </AuthShell>
  );
}
