"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Select } from "@/components/ui-kit";
import { toast } from "sonner";

const schema = z
  .object({
    username: z.string().min(3, "Username toi thieu 3 ky tu"),
    email: z.string().email("Email khong hop le"),
    password: z.string().min(6, "Toi thieu 6 ky tu"),
    confirmPassword: z.string().min(6, "Toi thieu 6 ky tu"),
    role: z.enum(["owner", "admin", "support", "viewer"]),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Mat khau xac nhan khong khop",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: "viewer" },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: values.username,
        email: values.email,
        password: values.password,
        role: values.role,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      toast.error(err?.message ?? "Dang ky that bai");
      return;
    }
    toast.success("Dang ky thanh cong");
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-[#0f1726]/90 p-6">
        <h1 className="text-2xl font-semibold">Tao tai khoan Admin</h1>
        <p className="mt-1 text-sm text-slate-400">Dang ky tai khoan moi de quan tri he thong.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Input placeholder="username" {...register("username")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.username?.message}</p>
          </div>
          <div>
            <Input placeholder="owner@aovpro.com" {...register("email")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.email?.message}</p>
          </div>
          <div>
            <Input type="password" placeholder="Mat khau" {...register("password")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.password?.message}</p>
          </div>
          <div>
            <Input type="password" placeholder="Nhap lai mat khau" {...register("confirmPassword")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.confirmPassword?.message}</p>
          </div>
          <div>
            <Select {...register("role")}>
              <option value="viewer">viewer</option>
              <option value="support">support</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </Select>
          </div>
          <Button disabled={loading} className="w-full">
            {loading ? "Dang xu ly..." : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          Da co tai khoan?{" "}
          <Link href="/login" className="text-cyan-300 hover:text-cyan-200">
            Dang nhap
          </Link>
        </p>
      </div>
    </div>
  );
}
