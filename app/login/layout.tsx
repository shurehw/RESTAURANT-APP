import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | OpsOS",
  description: "Sign in to OpsOS — the hospitality operations platform for finance, inventory, and intelligence.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
