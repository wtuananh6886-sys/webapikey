export const LOCALE_COOKIE = "nexora_locale";

export const SUPPORTED_LOCALES = ["vi", "en", "zh-CN", "zh-TW"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "vi";

export const LOCALE_LABELS: Record<Locale, string> = {
  vi: "Tiếng Việt",
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
