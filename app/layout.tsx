/**
 * OpsOS Root Layout
 * Loads fonts and provides basic HTML structure
 */

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: 'swap',
  fallback: ['system-ui', 'arial']
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export const metadata: Metadata = {
  title: {
    default: "OpsOS - Restaurant Operations Platform",
    template: "%s | OpsOS",
  },
  description:
    "Hospitality back-office platform integrating finance, inventory, recipes, budgets, and intelligence.",
  metadataBase: new URL("https://opsos-restaurant-app.vercel.app"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pulse",
    startupImage: "/icons/pulse-512.png",
  },
  icons: {
    icon: [
      { url: "/icons/pulse-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/pulse-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/pulse-192.png", sizes: "192x192", type: "image/png" },
    ],
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
        {/* PWA standalone detection — must run before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=window.matchMedia('(display-mode:standalone)').matches||window.navigator.standalone;if(s)document.documentElement.classList.add('pwa-standalone')})()`,
          }}
        />
        {children}
        <Toaster />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').then(function(reg){reg.addEventListener('updatefound',function(){var nw=reg.installing;if(nw){nw.addEventListener('statechange',function(){if(nw.state==='installed'&&navigator.serviceWorker.controller){nw.postMessage({type:'SKIP_WAITING'})}})}})});navigator.serviceWorker.addEventListener('controllerchange',function(){window.location.reload()})}`,
          }}
        />
      </body>
    </html>
  );
}
