import type { Metadata, Viewport } from "next";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="flex min-h-full min-h-[100dvh] flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-[100] focus:rounded-xl focus:bg-[var(--accent-deep)] focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-[#1a1208] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          Bỏ qua đến nội dung
        </a>
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
      </body>
    </html>
  );
}
