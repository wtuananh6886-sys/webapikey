import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...args: unknown[]) {
  return twMerge(clsx(args));
}

export function fmtDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}
