/**
 * OpsOS Root Layout
 * Loads fonts and provides basic HTML structure
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: 'swap',
  fallback: ['system-ui', 'arial']
});

export const metadata: Metadata = {
  title: {
    default: "OpsOS - Restaurant Operations Platform",
    template: "%s | OpsOS",
  },
  description:
    "Hospitality back-office platform integrating finance, inventory, recipes, budgets, and intelligence.",
  metadataBase: new URL("https://opsos-restaurant-app.vercel.app"),
  manifest: "/manifest.json",
  themeColor: "#0f172a",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pulse",
  },
  openGraph: {
    title: "OpsOS - Restaurant Operations Platform",
    description:
      "Hospitality back-office platform integrating finance, inventory, recipes, budgets, and intelligence.",
    siteName: "OpsOS",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}`,
          }}
        />
      </body>
    </html>
  );
}
