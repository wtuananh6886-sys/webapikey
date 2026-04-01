"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input } from "@/components/ui-kit";
import { toast } from "sonner";

const schema = z.object({
  identifier: z
    .string()
    .min(1, "Enter email or username")
    .max(120, "Too long")
    .refine((v) => {
      const t = v.trim();
      if (t.includes("@")) return z.string().email().safeParse(t).success;
      return t.length >= 3;
    }, "Use a valid email or username (min 3 characters)"),
  password: z.string().min(6, "Minimum 6 characters"),
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
      body: JSON.stringify({
        identifier: values.identifier.trim(),
        password: values.password,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      toast.error(err?.message ?? "Invalid login credentials");
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center px-4 py-8 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0f1726]/95 p-5 shadow-xl sm:p-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-400">Sign in with your email or username.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Input
              autoComplete="username"
              placeholder="Email or username"
              className="w-full"
              {...register("identifier")}
            />
            <p className="mt-1 text-xs text-red-400">{formState.errors.identifier?.message}</p>
          </div>
          <div>
            <Input type="password" autoComplete="current-password" placeholder="Password" className="w-full" {...register("password")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.password?.message}</p>
          </div>
          <Button disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-cyan-300 hover:text-cyan-200">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
