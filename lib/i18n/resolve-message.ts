import type { Locale } from "./constants";
import { messages } from "./messages";

export function resolveMessage(locale: Locale, path: string): string | undefined {
  const dict = messages[locale] as Record<string, unknown>;
  const parts = path.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}
