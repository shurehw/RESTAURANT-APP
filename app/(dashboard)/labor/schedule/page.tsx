export const dynamic = 'force-dynamic';

/**
 * Weekly Schedule Page
 * View and manage auto-generated schedules
 */

import { createClient } from '@/lib/supabase/server';
import { ScheduleCalendar } from '@/components/labor/ScheduleCalendar';
import { ScheduleOverridePanel } from '@/components/labor/ScheduleOverridePanel';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; venue?: string }>;
}) {
  const supabase = await createClient();

  // Get all active venues
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('is_active', true);

  if (!venues || venues.length === 0) {
    redirect('/');
  }

  // Use venue from URL param, fallback to first venue
  const params = await searchParams;
  const weekStart = params.week || getCurrentWeekStart();

  // Always keep venue in URL so client knows which venue is active
  if (!params.venue) {
    redirect(`/labor/schedule?week=${weekStart}&venue=${venues[0].id}`);
  }

  const venueId = params.venue;
  const venueName = venues.find(v => v.id === venueId)?.name || venues[0].name;

  // Fetch schedule for this week
  const { data: schedule, error: scheduleError } = await supabase
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
    .maybeSingle();

  // Fetch covers from forecasts_with_bias only (matches Forecasts page exactly)
  const weekDates = getWeekDates(weekStart);
  const forecastCovers: Record<string, { covers: number; revenue: number }> = {};

  const { data: biasForecasts } = await supabase
    .from('forecasts_with_bias')
    .select('business_date, covers_predicted, revenue_predicted')
    .eq('venue_id', venueId)
    .in('business_date', weekDates)
    .gt('covers_predicted', 0)
    .order('business_date');

  for (const f of biasForecasts || []) {
    if (!forecastCovers[f.business_date]) {
      forecastCovers[f.business_date] = {
        covers: Number(f.covers_predicted) || 0,
        revenue: Number(f.revenue_predicted) || 0,
      };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Weekly Schedule</h1>
          <p className="text-sm text-gray-500 mt-1">
            {venueName} — Auto-generated optimal schedules
          </p>
        </div>
        <Link
          href={`/labor/schedule/compare?week=${weekStart}&venue=${venueId}`}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Compare Weeks
        </Link>
      </div>

      {scheduleError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          Failed to load schedule: {scheduleError.message}
        </div>
      )}

      <ScheduleOverridePanel venueId={venueId} />

      <ScheduleCalendar
        schedule={scheduleError ? null : (schedule as any)}
        venueId={venueId}
        venueName={venueName}
        weekStart={weekStart}
        forecastCovers={forecastCovers}
      />
    </div>
  );
}

function getCurrentWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sunday in JS
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Snap to Monday
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday.toISOString().split('T')[0];
}

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStart + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}
