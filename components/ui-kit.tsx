"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-800/90 bg-[color:var(--card)]/90 p-4 shadow-[var(--shadow-card)] backdrop-blur-md transition-[box-shadow,transform,border-color] duration-300 ease-out",
        "lg:hover:border-slate-700/90 lg:hover:shadow-[var(--shadow-card-hover)] lg:hover:-translate-y-0.5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-slate-600/60 bg-slate-800/40 px-2.5 py-0.5 text-xs font-medium text-slate-200",
        className
      )}
    >
      {children}
    </span>
  );
}

const controlBase =
  "w-full min-h-11 rounded-xl border border-slate-700/90 bg-[#0b1220]/95 px-3.5 py-2.5 text-sm text-slate-100 shadow-inner shadow-black/20 outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-10";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        controlBase,
        "focus:border-blue-400/80 focus:ring-2 focus:ring-blue-500/25",
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        controlBase,
        "cursor-pointer focus:border-blue-400/80 focus:ring-2 focus:ring-blue-500/25",
        props.className
      )}
    />
  );
}

export function Button({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-11 min-w-[2.75rem] touch-manipulation items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-950/30 outline-none transition-[transform,box-shadow,filter,opacity] duration-200",
        "hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-900/25",
        "active:scale-[0.98] active:brightness-95",
        "focus-visible:ring-2 focus-visible:ring-blue-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090d14]",
        "disabled:pointer-events-none disabled:opacity-55 sm:min-h-10",
        className
      )}
    >
      {children}
    </button>
  );
}
