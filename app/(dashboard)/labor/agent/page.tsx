export const dynamic = 'force-dynamic';

/**
 * Staffing Agent Dashboard
 * Real-time view of the scheduling agent's pre-service and mid-service decisions
 */

import { createClient } from '@/lib/supabase/server';
import { StaffingAgentDashboard } from '@/components/labor/StaffingAgentDashboard';
import { redirect } from 'next/navigation';

export default async function StaffingAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const supabase = await createClient();

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('is_active', true);

  if (!venues || venues.length === 0) {
    redirect('/');
  }

  const params = await searchParams;

  if (!params.venue) {
    redirect(`/labor/agent?venue=${venues[0].id}`);
  }

  const venueId = params.venue;
  const selectedVenue = venues.find((v) => v.id === venueId);
  if (!selectedVenue) {
    redirect(`/labor/agent?venue=${venues[0].id}`);
  }
  const venueName = selectedVenue.name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Staffing Agent</h1>
        <p className="text-sm text-gray-500 mt-1">
          {venueName} — Real-time staffing decisions
        </p>
      </div>

      {venues.length > 1 && (
        <div className="flex gap-2">
          {venues.map((v) => (
            <a
              key={v.id}
              href={`/labor/agent?venue=${v.id}`}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                v.id === venueId
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {v.name}
            </a>
          ))}
        </div>
      )}

      <StaffingAgentDashboard venueId={venueId} venueName={venueName} />
    </div>
  );
}
