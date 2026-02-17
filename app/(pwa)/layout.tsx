/**
 * Pulse PWA Layout
 * Minimal chrome — no sidebar, just venue context + content.
 * Used when the app is installed as a standalone PWA.
 */

import { createClient } from '@/lib/supabase/server';
import { VenueProvider } from '@/components/providers/VenueProvider';
import { FloatingChatWidget, CommandTrigger } from '@/components/chatbot/FloatingChatWidget';
import { OpsOSLogo } from '@/components/ui/OpsOSLogo';

export const metadata = {
  title: 'Pulse',
};

export default async function PwaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth is enforced by middleware — no duplicate check here
  const supabase = await createClient();

  // Fetch venues for the VenueProvider
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, location, city, state')
    .eq('is_active', true);

  return (
    <VenueProvider initialVenues={venues || []}>
      <div className="min-h-screen bg-background flex flex-col" style={{ paddingTop: 'var(--sat)', paddingLeft: 'var(--sal)', paddingRight: 'var(--sar)' }}>
        {/* Thin PWA header */}
        <header className="h-12 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 flex items-center justify-between sticky top-0 z-50">
          <OpsOSLogo size="sm" />
          <CommandTrigger />
        </header>

        {/* Content */}
        <main className="flex-1 p-4" style={{ paddingBottom: 'var(--sab)' }}>{children}</main>

        {/* Command Panel */}
        <FloatingChatWidget />
      </div>
    </VenueProvider>
  );
}
