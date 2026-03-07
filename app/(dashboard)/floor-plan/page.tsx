export const dynamic = 'force-dynamic';

/**
 * Floor Plan Page
 * Visual floor plan editor with drag-and-drop table placement and staff section assignments.
 */

import { createClient } from '@/lib/supabase/server';
import { FloorPlanEditor } from '@/components/floor-plan/FloorPlanEditor';
import { redirect } from 'next/navigation';

export default async function FloorPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const supabase = await createClient();

  // Get all active venues (auth handled by dashboard layout)
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('is_active', true);

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
