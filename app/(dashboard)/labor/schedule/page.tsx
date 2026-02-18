export const dynamic = 'force-dynamic';

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

  // Fetch covers from forecasts_with_bias (matches Forecasts page)
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

  // Backfill missing dates from demand_forecasts (raw)
  const missingDates = weekDates.filter(d => !forecastCovers[d]);
  if (missingDates.length > 0) {
    const { data: rawForecasts } = await supabase
      .from('demand_forecasts')
      .select('business_date, forecast_date, covers_predicted, revenue_predicted')
      .eq('venue_id', venueId)
      .in('business_date', missingDates)
      .order('business_date')
      .order('forecast_date', { ascending: false });

    for (const f of rawForecasts || []) {
      if (!forecastCovers[f.business_date]) {
        forecastCovers[f.business_date] = {
          covers: Number(f.covers_predicted) || 0,
          revenue: Number(f.revenue_predicted) || 0,
        };
      }
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
      </div>

      {scheduleError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          Failed to load schedule: {scheduleError.message}
        </div>
      )}

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
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Get Monday
  const monday = new Date(now);
  monday.setDate(monday.getDate() + diff);
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
