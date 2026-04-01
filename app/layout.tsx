import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "WebAPIKey Admin",
  description: "Premium admin dashboard for licenses, servers and tweaks",
  authors: [{ name: "tuananh" }],
  creator: "tuananh",
  applicationName: "WebAPIKey by tuananh",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090d14" },
    { color: "#090d14" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full min-h-[100dvh] flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-[100] focus:rounded-xl focus:bg-cyan-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
        >
          Bỏ qua đến nội dung
        </a>
        {children}
        <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-50 hidden rounded-full border border-cyan-400/35 bg-[#0b1220]/85 px-2.5 py-1 text-xs font-semibold text-cyan-300 shadow-lg backdrop-blur-md sm:block">
          A
        </div>
        <div className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 hidden max-w-[min(100vw-2rem,14rem)] rounded-xl border border-slate-700/80 bg-[#0b1220]/85 px-3 py-1.5 text-center text-[10px] leading-snug text-slate-400 shadow-lg backdrop-blur-md sm:block">
          © {new Date().getFullYear()} tuananh
        </div>
        <Toaster
          theme="dark"
          richColors
          position="top-center"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "rounded-xl border border-slate-700/80 bg-[#0f1726]/95 backdrop-blur-md shadow-xl sm:max-w-md",
            },
          }}
          className="!top-[max(0.75rem,env(safe-area-inset-top))] sm:!left-auto sm:!right-4 sm:!top-4"
        />
      </body>
    </html>
  );
}
