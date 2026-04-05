"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, FieldLabel, Input } from "@/components/ui-kit";
import { PasswordField } from "@/components/password-field";
import { toast } from "sonner";
import { Lock } from "lucide-react";

const schema = z
  .object({
    username: z.string().min(3, "Username tối thiểu 3 ký tự"),
    email: z.string().email("Email không hợp lệ"),
    password: z.string().min(6, "Tối thiểu 6 ký tự"),
    confirmPassword: z.string().min(6, "Xác nhận mật khẩu"),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Mật khẩu xác nhận không khớp",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const pwd = watch("password") ?? "";

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: values.username,
        email: values.email,
        password: values.password,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      toast.error(err?.message ?? "Đăng ký thất bại");
      return;
    }
    router.push("/login?registered=1");
  };

  const strength =
    pwd.length >= 12 ? "strong" : pwd.length >= 8 ? "medium" : pwd.length >= 6 ? "basic" : "none";

  return (
    <div
      id="main-content"
      tabIndex={-1}
      className="auth-card-enter nexora-frame relative w-full max-w-md p-6 sm:p-8"
    >
      <div className="relative z-[1]">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--teal)]">Đăng ký</p>
        <h1 className="font-display mt-3 text-[1.75rem] leading-tight text-[var(--foreground)] sm:text-[2rem]">
          Tạo tài khoản
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Bắt đầu với quyền chuẩn. Nâng cấp owner/admin do quản trị viên cấp sau khi xác minh.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <FieldLabel htmlFor="reg-username">Username</FieldLabel>
          <Input
            id="reg-username"
            placeholder="tên_hiển_thị"
            autoComplete="username"
            aria-invalid={!!formState.errors.username}
            {...register("username")}
          />
          {formState.errors.username ? (
            <p className="mt-1.5 text-xs text-[var(--danger)]" role="alert">
              {formState.errors.username.message}
            </p>
          ) : null}
        </div>
        <div>
          <FieldLabel htmlFor="reg-email">Email</FieldLabel>
          <Input
            id="reg-email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            aria-invalid={!!formState.errors.email}
            {...register("email")}
          />
          {formState.errors.email ? (
            <p className="mt-1.5 text-xs text-[var(--danger)]" role="alert">
              {formState.errors.email.message}
            </p>
          ) : null}
        </div>
        <div>
          <FieldLabel htmlFor="reg-password">Mật khẩu</FieldLabel>
          <PasswordField
            id="reg-password"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={!!formState.errors.password}
            {...register("password")}
          />
          {pwd.length > 0 ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
              <Lock size={12} className="shrink-0 opacity-70" aria-hidden />
              <span>
                Độ mạnh:{" "}
                <span
                  className={
                    strength === "strong"
                      ? "text-[var(--teal)]"
                      : strength === "medium"
                        ? "text-[var(--accent)]"
                        : strength === "basic"
                          ? "text-[var(--foreground-muted)]"
                          : ""
                  }
                >
                  {strength === "strong"
                    ? "Tốt"
                    : strength === "medium"
                      ? "Trung bình"
                      : strength === "basic"
                        ? "Cơ bản"
                        : ""}
                </span>
                {pwd.length < 12 ? " — nên ≥12 ký tự cho tài khoản quan trọng." : ""}
              </span>
            </div>
          ) : null}
          {formState.errors.password ? (
            <p className="mt-1.5 text-xs text-[var(--danger)]" role="alert">
              {formState.errors.password.message}
            </p>
          ) : null}
        </div>
        <div>
          <FieldLabel htmlFor="reg-confirm">Xác nhận mật khẩu</FieldLabel>
          <PasswordField
            id="reg-confirm"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={!!formState.errors.confirmPassword}
            {...register("confirmPassword")}
          />
          {formState.errors.confirmPassword ? (
            <p className="mt-1.5 text-xs text-[var(--danger)]" role="alert">
              {formState.errors.confirmPassword.message}
            </p>
          ) : null}
        </div>

        <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--foreground-secondary)]">
          Bằng việc đăng ký, bạn đồng ý dữ liệu được lưu theo chính sách vận hành của admin. Mật khẩu được hash
          (scrypt), không lưu dạng plain text.
        </p>

        <Button type="submit" disabled={loading} variant="primary" className="w-full" size="lg">
          {loading ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-[var(--foreground-muted)]">
        Đã có tài khoản?{" "}
        <Link href="/login" className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
          Đăng nhập
        </Link>
      </p>
      </div>
    </div>
  );
}
