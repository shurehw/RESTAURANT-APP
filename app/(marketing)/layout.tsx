/**
 * KevaOS Marketing Layout
 * Warm hospitality brand — ivory, espresso, copper
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KevaOS — The AI-Enforced Control Plane for Hospitality',
  description:
    'The operating system that enforces daily restaurant operations — so the same problems don\'t happen twice.',
  openGraph: {
    title: 'KevaOS — The AI-Enforced Control Plane for Hospitality',
    description:
      'The operating system that enforces daily restaurant operations — so the same problems don\'t happen twice.',
    siteName: 'KevaOS',
    type: 'website',
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-keva-fog-50 text-keva-slate font-sans antialiased">
      {children}
    </div>
  );
}
