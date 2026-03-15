export const dynamic = 'force-dynamic';

/**
 * Floor Plan Page
 * Visual floor plan editor with drag-and-drop table placement and staff section assignments.
 */

import { createClient } from '@/lib/supabase/server';
import { FloorPlanEditor } from '@/components/floor-plan/FloorPlanEditor';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';

export default async function FloorPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const supabase = await createClient();
  const user = await requireUser();
  const { venueIds } = await getUserOrgAndVenues(user.id);

  // Get all active venues (auth handled by dashboard layout)
  let query = supabase
    .from('venues')
    .select('id, name')
    .eq('is_active', true);
  if (venueIds.length > 0) {
    query = query.in('id', venueIds);
  }
  const { data: venues } = await query;

  if (!venues || venues.length === 0) {
    redirect('/');
  }

  const params = await searchParams;

  // Keep venue in URL so client knows which venue is active
  if (!params.venue) {
    redirect(`/floor-plan?venue=${venues[0].id}`);
  }

  const venueId = params.venue;

  return (
    <div className="h-full">
      <FloorPlanEditor venues={venues} initialVenueId={venueId} />
    </div>
  );
}
