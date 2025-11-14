/**
 * OpsOS Root Layout
 * Loads fonts and provides basic HTML structure
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: 'swap',
  fallback: ['system-ui', 'arial']
});

export const metadata: Metadata = {
  title: "OpsOS - Restaurant Operations Platform",
  description: "Hospitality back-office platform integrating finance, inventory, recipes, budgets, and intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
