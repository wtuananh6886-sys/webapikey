import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <div className="fixed bottom-3 left-3 z-50 rounded-full border border-cyan-400/40 bg-[#0b1220]/90 px-2.5 py-1 text-xs font-semibold text-cyan-300">
          A
        </div>
        <div className="pointer-events-none fixed bottom-3 right-3 z-50 rounded-xl border border-slate-700 bg-[#0b1220]/90 px-3 py-1.5 text-[11px] text-slate-300">
          © {new Date().getFullYear()} tuananh. All rights reserved.
        </div>
        <Toaster theme="dark" richColors position="top-right" />
      </body>
    </html>
  );
}
