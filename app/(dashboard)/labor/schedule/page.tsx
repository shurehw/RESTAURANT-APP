/**
 * Weekly Schedule Page
 * View and manage auto-generated schedules
 */

import { createClient } from '@/lib/supabase/server';
import { ScheduleCalendar } from '@/components/labor/ScheduleCalendar';
import { redirect } from 'next/navigation';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
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

  // Get week start (default to current week)
  const { week } = await searchParams;
  const weekStart = week || getCurrentWeekStart();

  // Fetch schedule for this week
  const { data: schedule } = await supabase
    .from('weekly_schedules')
    .select(`
      *,
      shifts:shift_assignments(
        *,
        employee:employees(id, first_name, last_name, email),
        position:positions(id, name, category, base_hourly_rate)
      )
    `)
    .eq('venue_id', venueId)
    .eq('week_start_date', weekStart)
    .single();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Weekly Schedule</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-generated optimal schedules
          </p>
        </div>
      </div>

      <ScheduleCalendar
        schedule={schedule}
        venueId={venueId}
        weekStart={weekStart}
      />
    </div>
  );
}

function getCurrentWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Get Monday
  const monday = new Date(now);
  monday.setDate(monday.getDate() + diff);
  return monday.toISOString().split('T')[0];
}
