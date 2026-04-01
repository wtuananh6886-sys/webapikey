"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input } from "@/components/ui-kit";
import { toast } from "sonner";

const schema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Minimum 6 characters"),
    confirmPassword: z.string().min(6, "Minimum 6 characters"),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Password confirmation does not match",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
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
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      toast.error(err?.message ?? "Registration failed");
      return;
    }
    toast.success("Registration successful");
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center px-4 py-8 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0f1726]/95 p-5 shadow-xl sm:p-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Create your account</h1>
        <p className="mt-1 text-sm text-slate-400">Start with a standard account and request elevated access later.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Input placeholder="Username" {...register("username")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.username?.message}</p>
          </div>
          <div>
            <Input placeholder="email@domain.com" {...register("email")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.email?.message}</p>
          </div>
          <div>
            <Input type="password" placeholder="Password" {...register("password")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.password?.message}</p>
          </div>
          <div>
            <Input type="password" placeholder="Confirm password" {...register("confirmPassword")} />
            <p className="mt-1 text-xs text-red-400">{formState.errors.confirmPassword?.message}</p>
          </div>
          <Button disabled={loading} className="w-full">
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-cyan-300 hover:text-cyan-200">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
