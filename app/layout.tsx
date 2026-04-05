import type { Metadata, Viewport } from "next";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "sonner";
import { AppProviders } from "@/components/app-providers";
import { SkipToContentLink } from "@/components/skip-to-content";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Nexora-API — License & API console",
  description: "Console quản lý license, API key và chính sách tài khoản — Nexora-API.",
  authors: [{ name: "tuananh" }],
  creator: "tuananh",
  applicationName: "Nexora-API",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#071018" },
    { color: "#071018" },
  ],
};

function htmlLangFromCookieLocale(locale: string): string {
  if (locale === "vi") return "vi";
  if (locale === "en") return "en";
  return "zh";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  return (
    <html
      lang={htmlLangFromCookieLocale(initialLocale)}
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="flex min-h-full min-h-[100dvh] flex-col">
        <AppProviders initialLocale={initialLocale}>
        <SkipToContentLink />
        {children}
        <Toaster
          theme="dark"
          richColors
          position="top-center"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)]/95 backdrop-blur-md shadow-xl sm:max-w-md",
            },
          }}
          className="!top-[max(0.75rem,env(safe-area-inset-top))] sm:!left-auto sm:!right-4 sm:!top-4"
        />
        </AppProviders>
      </body>
    </html>
  );
}
