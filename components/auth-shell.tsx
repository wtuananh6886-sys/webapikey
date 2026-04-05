import type { ReactNode } from "react";
import Link from "next/link";
import { KeyRound, Shield, Sparkles } from "lucide-react";

const highlights = [
  { icon: Shield, text: "Session JWT & hash key — chuẩn production" },
  { icon: KeyRound, text: "License, package, quota trong một console" },
  { icon: Sparkles, text: "Giao diện celestial, mượt trên mobile & desktop" },
];

export function AuthShell({
  children,
  eyebrow = "Nexora-API",
  title,
  description,
}: {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative z-[1] min-h-screen min-h-[100dvh] overflow-x-hidden">
      <div className="mx-auto grid min-h-screen min-h-[100dvh] w-full max-w-[1180px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,24.5rem)] lg:gap-10 lg:px-8">
        <aside className="relative hidden flex-col justify-between py-12 pl-4 pr-2 lg:flex xl:py-16">
          <div>
            <Link
              href="/"
              className="group inline-flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)]/90 px-4 py-3 shadow-[var(--shadow-soft)] backdrop-blur-sm transition hover:border-[var(--border-strong)]"
            >
              <span className="nexora-mark grid h-11 w-11 place-items-center rounded-xl text-lg font-bold tracking-tight">
                N
              </span>
              <span className="text-left">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
                  {eyebrow}
                </span>
                <span className="font-display text-lg text-[var(--foreground)]">Console</span>
              </span>
            </Link>

            <h1 className="auth-aside-title font-display mt-14 max-w-lg text-3xl leading-[1.18] text-[var(--foreground)] xl:text-[2.35rem]">
              {title}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-[var(--foreground-muted)]">{description}</p>

            <ul className="mt-12 space-y-3">
              {highlights.map(({ icon: Icon, text }) => (
                <li
                  key={text}
                  className="nexora-frame flex gap-3 px-4 py-3.5"
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--teal-subtle)] text-[var(--teal)] ring-1 ring-[var(--teal)]/25">
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="text-sm leading-snug text-[var(--foreground-secondary)]">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-[var(--foreground-muted)]">
            © {new Date().getFullYear()} Nexora-API
          </p>
        </aside>

        <div className="flex flex-col justify-center px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-2 lg:py-12">
          <div className="mb-6 flex items-center justify-center lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--foreground-secondary)]">
              <span className="nexora-mark grid h-9 w-9 place-items-center rounded-lg text-sm font-bold">N</span>
              <span className="font-display text-lg text-[var(--foreground)]">Nexora-API</span>
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
