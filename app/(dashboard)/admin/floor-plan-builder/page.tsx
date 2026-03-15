export const dynamic = 'force-dynamic';

/**
 * Floor Plan Builder — Settings
 * Design and manage floor plan layouts: add/edit tables, sections, labels.
 * For daily staff assignments, use the Floor Plan ops page (/floor-plan).
 */

import { createClient } from '@/lib/supabase/server';
import { FloorPlanBuilder } from '@/components/floor-plan/FloorPlanBuilder';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';

export default async function FloorPlanBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const supabase = await createClient();
  const user = await requireUser();
  const { venueIds } = await getUserOrgAndVenues(user.id);

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
  if (!params.venue) {
    redirect(`/admin/floor-plan-builder?venue=${venues[0].id}`);
  }

  return (
    <div className="h-full">
      <FloorPlanBuilder venues={venues} initialVenueId={params.venue} />
    </div>
  );
}
