import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/labor/schedule/compare?venue_id=...&week_start=YYYY-MM-DD
 *
 * Returns the weekly_schedule record + all shift_assignments for a given venue/week.
 * Used by the ScheduleCompare component to render the week-over-week view.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get('venue_id');
    const weekStart = searchParams.get('week_start');

    if (!venueId || !weekStart) {
      return NextResponse.json({ error: 'venue_id and week_start are required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch the weekly schedule header
    const { data: schedule, error: schedErr } = await supabase
      .from('weekly_schedules')
      .select('id, week_start_date, week_end_date, status, total_labor_hours, total_labor_cost, labor_percentage, projected_revenue, auto_generated, overall_cplh, service_quality_score')
      .eq('venue_id', venueId)
      .eq('week_start_date', weekStart)
      .maybeSingle();

    if (schedErr) {
      return NextResponse.json({ error: schedErr.message }, { status: 500 });
    }

    if (!schedule) {
      return NextResponse.json({ schedule: null, shifts: [] });
    }

    // Fetch shifts for this schedule
    const { data: shifts, error: shiftErr } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        business_date,
        shift_type,
        scheduled_start,
        scheduled_end,
        scheduled_hours,
        scheduled_cost,
        status,
        is_modified,
        employee:employees(id, first_name, last_name),
        position:positions(id, name, category, base_hourly_rate)
      `)
      .eq('schedule_id', schedule.id)
      .neq('status', 'cancelled')
      .order('business_date')
      .order('scheduled_start');

    if (shiftErr) {
      return NextResponse.json({ error: shiftErr.message }, { status: 500 });
    }

    return NextResponse.json({ schedule, shifts: shifts ?? [] });
  } catch (err) {
    console.error('[schedule/compare] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
