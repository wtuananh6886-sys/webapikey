"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input } from "@/components/ui-kit";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Tối thiểu 6 ký tự"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Sai thông tin đăng nhập");
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-[#0f1726]/90 p-6">
        <h1 className="text-2xl font-semibold">Đăng nhập Admin</h1>
        <p className="mt-1 text-sm text-slate-400">Xác thực trước khi truy cập dashboard.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Input placeholder="owner@aovpro.com" {...register("email")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.email?.message}</p>
          </div>
          <div>
            <Input type="password" placeholder="••••••••" {...register("password")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.password?.message}</p>
          </div>
          <Button disabled={loading} className="w-full">
            {loading ? "Đang xử lý..." : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
