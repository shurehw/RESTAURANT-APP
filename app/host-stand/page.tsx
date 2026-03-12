export const dynamic = 'force-dynamic';

/**
 * app/host-stand/page.tsx
 * Host stand main page — server component shell that verifies auth
 * and renders the live floor management view.
 * Pattern: app/vendor/dashboard/page.tsx
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HostStandView } from '@/components/host-stand/HostStandView';

export default async function HostStandPage({
  searchParams,
}: {
  searchParams: Promise<{ venue_id?: string }>;
}) {
  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/host-stand/login');

  // Verify host stand access
  const admin = createAdminClient();
  const { data: hostUser, error: hostError } = await admin
    .from('host_stand_users')
    .select('id, venue_id, display_name, org_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (hostError || !hostUser) redirect('/host-stand/login');

  // Use venue from host_stand_users (authoritative)
  const sp = await searchParams;
  const venueId = sp.venue_id === hostUser.venue_id ? sp.venue_id : hostUser.venue_id;

  // Fetch venue name
  const { data: venue } = await admin
    .from('venues')
    .select('id, name')
    .eq('id', venueId)
    .single();

  return (
    <HostStandView
      venueId={venueId}
      venueName={venue?.name || 'Host Stand'}
      hostName={hostUser.display_name || user.email || ''}
      userId={user.id}
    />
  );
}
