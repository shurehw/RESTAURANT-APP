export const dynamic = 'force-dynamic';

/**
 * Schedule Compare Page
 * Compare the current KevaOS-generated schedule against previous weeks.
 */

import { createClient } from '@/lib/supabase/server';
import { ScheduleCompare } from '@/components/labor/ScheduleCompare';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function ScheduleComparePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; venue?: string }>;
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
  const weekStart = params.week || getCurrentWeekStart();

  if (!params.venue) {
    redirect(`/labor/schedule/compare?week=${weekStart}&venue=${venues[0].id}`);
  }

  const venueId = params.venue;
  const venueName = venues.find(v => v.id === venueId)?.name || venues[0].name;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/labor/schedule?week=${weekStart}&venue=${venueId}`}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Schedule
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Schedule Comparison</h1>
          <p className="text-sm text-gray-500 mt-1">
            {venueName} — Compare current week against previous weeks
          </p>
        </div>
      </div>

      <ScheduleCompare
        venueId={venueId}
        venueName={venueName}
        currentWeekStart={weekStart}
      />
    </div>
  );
}

function getCurrentWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday.toISOString().split('T')[0];
}
