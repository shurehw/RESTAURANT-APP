export const dynamic = 'force-dynamic';

/**
 * Labor Requirements Page
 * View ML-calculated staffing needs by date/shift
 */

import { createClient } from '@/lib/supabase/server';
import { RequirementsDisplay } from '@/components/labor/RequirementsDisplay';
import { redirect } from 'next/navigation';

export default async function LaborRequirementsPage() {
  const supabase = await createClient();

  // Get user's selected venue
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('is_active', true)
    .limit(1);

  if (!venues || venues.length === 0) {
    redirect('/');
  }

  const venueId = venues[0].id;

  // Fetch labor requirements for next 7 days
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const { data: requirements } = await supabase
    .from('labor_requirements')
    .select(`
      *,
      position:positions(name, category, base_hourly_rate),
      forecast:demand_forecasts(business_date, shift_type, covers_predicted, revenue_predicted)
    `)
    .eq('venue_id', venueId)
    .gte('business_date', today.toISOString().split('T')[0])
    .lte('business_date', nextWeek.toISOString().split('T')[0])
    .order('business_date', { ascending: true })
    .order('shift_type', { ascending: true });

  // Get labor targets
  const { data: laborTargets } = await supabase
    .from('labor_targets')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .limit(1)
    .single();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Labor Requirements</h1>
          <p className="text-sm text-gray-500 mt-1">
            ML-calculated staffing needs based on demand forecasts
          </p>
        </div>
        <div className="text-sm text-gray-600">
          <div className="font-medium">Labor Target</div>
          <div className="text-opsos-brass-600 font-bold">
            {laborTargets?.target_labor_percentage || 27.5}%
          </div>
        </div>
      </div>

      <RequirementsDisplay
        requirements={(requirements || []) as any}
        venueId={venueId}
        laborTarget={laborTargets?.target_labor_percentage || 27.5}
      />
    </div>
  );
}
