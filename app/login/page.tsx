import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

function LoginFallback() {
  return (
    <div className="nexora-frame relative w-full max-w-md animate-pulse p-8">
      <div className="h-6 w-40 rounded-lg bg-[var(--muted)]" />
      <div className="mt-4 h-4 w-full max-w-xs rounded bg-[var(--muted)]" />
      <div className="mt-8 space-y-4">
        <div className="h-11 w-full rounded-xl bg-[var(--muted)]" />
        <div className="h-11 w-full rounded-xl bg-[var(--muted)]" />
        <div className="h-11 w-full rounded-xl bg-[var(--accent-subtle)]" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Console license & API key theo phong cách celestial — rõ ràng, an toàn."
      description="Nexora-API đồng bộ Supabase, phân quyền owner/admin/support, tối ưu mobile. Giao diện lấy cảm hứng từ aesthetic fantasy hiện đại (không dùng tài sản game bên thứ ba)."
    >
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
