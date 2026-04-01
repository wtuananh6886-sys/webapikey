"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordField({ className, id, ...props }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        className={cn("pr-12 sm:pr-11", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-lg text-slate-400 outline-none transition hover:bg-slate-800/80 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-500/50 sm:h-9 sm:w-9"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}
