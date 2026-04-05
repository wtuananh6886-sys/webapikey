import Link from "next/link";
import { ArrowRight, KeyRound, LayoutDashboard, Shield, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "License & API key",
    desc: "Tạo key động/tĩnh, mask an toàn, verify có pepper — tối ưu cho SaaS bán gói.",
    icon: KeyRound,
  },
  {
    title: "Phân quyền rõ ràng",
    desc: "Owner, admin, support, viewer — policy & quota đồng bộ Supabase.",
    icon: Shield,
  },
  {
    title: "Trải nghiệm VIP",
    desc: "Sidebar celestial, drawer mobile, bảng và chart — đồng bộ theme vàng–teal đêm sao.",
    icon: LayoutDashboard,
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[var(--background)]" aria-hidden />
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 90% 70% at 50% -25%, var(--glow-a), transparent 55%),
            radial-gradient(ellipse 70% 50% at 100% 10%, var(--glow-b), transparent 50%)
          `,
        }}
      />

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="nexora-mark grid h-9 w-9 place-items-center rounded-xl text-sm font-bold shadow-lg">
            N
          </span>
          <span className="font-display text-lg tracking-tight text-[var(--foreground)]">Nexora-API</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden sm:inline-flex border border-[var(--border-subtle)]"
            )}
          >
            Đăng nhập
          </Link>
          <Link href="/register" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
            Bắt đầu
            <ArrowRight className="h-4 w-4 opacity-90" aria-hidden />
          </Link>
        </nav>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pb-28 lg:pt-10">
        <section className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--teal)] shadow-[var(--shadow-soft)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
            Celestial console
          </p>
          <h1 className="font-display mt-6 text-[clamp(2rem,5.5vw,3.5rem)] leading-[1.1] text-[var(--foreground)]">
            Nexora-API
            <span className="mt-2 block text-[clamp(1.1rem,2.8vw,1.35rem)] font-normal tracking-wide text-[var(--foreground-secondary)]">
              License &amp; API key — giao diện lấy cảm hứng fantasy hiện đại, an toàn cho production.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--foreground-muted)] sm:text-lg">
            Session JWT, hash scrypt, Supabase — kiểm soát gói, quota và nhật ký trên mọi thiết bị.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/register" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "justify-center px-8")}>
              Tạo tài khoản
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "secondary", size: "lg" }),
                "justify-center border-[var(--border-strong)] px-8"
              )}
            >
              Đã có tài khoản
            </Link>
          </div>
        </section>

        <section className="mx-auto mt-20 grid gap-4 sm:grid-cols-2 lg:mt-28 lg:grid-cols-3">
          {features.map(({ title, desc, icon: Icon }) => (
            <article
              key={title}
              className="group rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--surface-panel)]/90 p-6 shadow-[var(--shadow-soft)] backdrop-blur-md transition duration-300 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-card)]"
            >
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--teal-subtle)] text-[var(--teal)] ring-1 ring-[var(--teal)]/25 transition group-hover:ring-[var(--accent)]/35">
                <Icon size={22} strokeWidth={1.75} aria-hidden />
              </div>
              <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">{desc}</p>
            </article>
          ))}
        </section>

        <section className="mx-auto mt-16 max-w-2xl rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-gradient-to-br from-[var(--accent-subtle)] to-transparent p-8 text-center shadow-inner shadow-black/20 sm:mt-24">
          <p className="text-sm font-medium text-[var(--foreground)]">Sẵn sàng vào console?</p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            Đăng nhập để xem license, server, tweaks và nhật ký hoạt động.
          </p>
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-6 inline-flex")}>
            Mở dashboard
          </Link>
        </section>
      </main>

      <footer className="border-t border-[var(--border-subtle)] py-8 text-center text-xs text-[var(--foreground-muted)]">
        © {new Date().getFullYear()} Nexora-API
      </footer>
    </div>
  );
}
