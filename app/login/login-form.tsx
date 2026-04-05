"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, FieldLabel, Input } from "@/components/ui-kit";
import { PasswordField } from "@/components/password-field";
import { toast } from "sonner";

const schema = z.object({
  identifier: z
    .string()
    .min(1, "Nhập email hoặc tên đăng nhập")
    .max(120, "Quá dài")
    .refine((v) => {
      const t = v.trim();
      if (t.includes("@")) return z.string().email().safeParse(t).success;
      return t.length >= 3;
    }, "Email hợp lệ hoặc username từ 3 ký tự"),
  password: z.string().min(6, "Tối thiểu 6 ký tự"),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const registeredToastShown = useRef(false);
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (searchParams.get("registered") !== "1" || registeredToastShown.current) return;
    registeredToastShown.current = true;
    toast.success("Tài khoản đã được tạo. Vui lòng đăng nhập.");
    router.replace("/login", { scroll: false });
  }, [searchParams, router]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: values.identifier.trim(),
        password: values.password,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      toast.error(err?.message ?? "Đăng nhập thất bại");
      return;
    }
    const next = searchParams.get("next");
    const safe =
      next && next.startsWith("/dashboard") && !next.startsWith("//") ? next : "/dashboard";
    router.push(safe);
  };

  return (
    <div
      id="main-content"
      tabIndex={-1}
      className="auth-card-enter nexora-frame relative w-full max-w-md p-6 sm:p-8"
    >
      <div className="relative z-[1]">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--teal)]">Đăng nhập</p>
        <h1 className="font-display mt-3 text-[1.75rem] leading-tight text-[var(--foreground)] sm:text-[2rem]">
          Chào mừng trở lại
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Đăng nhập bằng email hoặc username đã đăng ký. Dữ liệu được mã hóa qua cookie bảo mật.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <FieldLabel htmlFor="login-identifier">Email hoặc username</FieldLabel>
          <Input
            id="login-identifier"
            autoComplete="username"
            placeholder="you@company.com"
            className="w-full"
            aria-invalid={!!formState.errors.identifier}
            {...register("identifier")}
          />
          {formState.errors.identifier ? (
            <p className="mt-1.5 text-xs text-[var(--danger)]" role="alert">
              {formState.errors.identifier.message}
            </p>
          ) : null}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <FieldLabel htmlFor="login-password">Mật khẩu</FieldLabel>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <PasswordField
            id="login-password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={!!formState.errors.password}
            {...register("password")}
          />
          {formState.errors.password ? (
            <p className="mt-1.5 text-xs text-[var(--danger)]" role="alert">
              {formState.errors.password.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={loading} variant="primary" className="w-full" size="lg">
          {loading ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-[var(--foreground-muted)]">
        Chưa có tài khoản?{" "}
        <Link href="/register" className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
          Đăng ký
        </Link>
      </p>
      </div>
    </div>
  );
}
