import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[color:var(--card)]/95 p-4 shadow-[var(--shadow-card)] backdrop-blur-md transition-[box-shadow,transform,border-color] duration-300 ease-out",
        "lg:hover:border-[var(--border-strong)] lg:hover:shadow-[var(--shadow-card-hover)] lg:hover:-translate-y-0.5",
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
        "inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--foreground-secondary)]",
        className
      )}
    >
      {children}
    </span>
  );
}

export function FieldLabel({ className, children, htmlFor }: { className?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("mb-1.5 block text-xs font-medium tracking-wide text-[var(--foreground-secondary)]", className)}
    >
      {children}
    </label>
  );
}

const controlBase =
  "w-full min-h-11 rounded-xl border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 py-2.5 text-sm text-[var(--foreground)] shadow-inner shadow-black/15 outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--foreground-muted)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        controlBase,
        "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]",
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
        "cursor-pointer focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]",
        props.className
      )}
    />
  );
}

export const buttonVariants = cva(
  "inline-flex min-h-11 min-w-[2.75rem] touch-manipulation items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none transition-[transform,box-shadow,filter,opacity,background-color,border-color,color] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:min-h-10",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-[var(--accent)] to-[var(--accent-deep)] text-[#1a1208] shadow-lg shadow-[var(--accent-glow)] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--accent-ring-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        secondary:
          "border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--foreground)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        ghost:
          "border border-transparent bg-transparent text-[var(--foreground-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        danger:
          "border border-red-500/35 bg-red-950/40 text-red-100 hover:bg-red-950/55 focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
      },
      size: {
        default: "px-4 py-2.5 text-sm",
        sm: "min-h-9 rounded-lg px-3 py-2 text-xs sm:min-h-9",
        lg: "min-h-12 rounded-xl px-5 py-3 text-[15px] sm:min-h-11",
        icon: "min-h-11 w-11 p-0 sm:min-h-10 sm:w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { children: ReactNode };

export function Button({ children, className, variant, size, ...props }: ButtonProps) {
  return (
    <button {...props} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </button>
  );
}
