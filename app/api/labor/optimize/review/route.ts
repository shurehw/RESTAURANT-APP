import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validateQuery, uuid } from '@/lib/validate';
import { z } from 'zod';

const reviewQuerySchema = z.object({
  venue_id: uuid,
  weeks: z.coerce.number().int().min(1).max(26).optional().default(8),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type PositionBucket = {
  planned_hours: number;
  actual_hours: number;
  planned_cost: number;
  actual_cost: number;
  planned_shifts: number;
  actual_shifts: number;
};

function toDateOnly(v: string): string {
  return v.split('T')[0];
}

function weekStartForDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().split('T')[0];
}

function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function inferredHours(row: { actual_hours?: number | null; clock_in?: string | null; clock_out?: string | null }): number {
  if (typeof row.actual_hours === 'number' && row.actual_hours > 0) return row.actual_hours;
  if (!row.clock_in || !row.clock_out) return 0;
  const start = new Date(row.clock_in).getTime();
  const end = new Date(row.clock_out).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / 3600000;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':labor-optimize-review');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const params = validateQuery(reviewQuerySchema, request.nextUrl.searchParams);
    assertVenueAccess(params.venue_id, venueIds);

    const admin = createAdminClient();
    const weeks = params.weeks ?? 8;

    let schedulesQuery = admin
      .from('weekly_schedules')
      .select('id, week_start_date, week_end_date, status, generated_at, created_at')
      .eq('venue_id', params.venue_id)
      .order('week_start_date', { ascending: false })
      .limit(weeks);

    if (params.end_date) {
      schedulesQuery = schedulesQuery.lte('week_start_date', params.end_date);
    }

    const { data: schedules, error: schedulesError } = await schedulesQuery;
    if (schedulesError) throw schedulesError;

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({
        success: true,
        venue_id: params.venue_id,
        weeks_requested: weeks,
        data_source: {
          planned: 'weekly_schedules + shift_assignments',
          actual: 'actual_shifts_worked (7shifts sync)',
        },
        summary: null,
        weeks: [],
      });
    }

    const scheduleById = new Map(schedules.map(s => [s.id, s]));
    const weekStarts = new Set(schedules.map(s => s.week_start_date));
    const scheduleIds = schedules.map(s => s.id);
    const minDate = schedules.reduce((min, s) => s.week_start_date < min ? s.week_start_date : min, schedules[0].week_start_date);
    const maxDate = schedules.reduce((max, s) => s.week_end_date > max ? s.week_end_date : max, schedules[0].week_end_date);

    const [{ data: plannedShifts, error: plannedError }, { data: actualShifts, error: actualError }] = await Promise.all([
      admin
        .from('shift_assignments')
        .select('schedule_id, business_date, employee_id, position_id, scheduled_hours, scheduled_cost, hourly_rate, status, position:positions(name)')
        .in('schedule_id', scheduleIds)
        .neq('status', 'cancelled'),
      admin
        .from('actual_shifts_worked')
        .select('business_date, employee_id, position_id, actual_hours, hourly_rate, total_compensation, clock_in, clock_out, position:positions(name)')
        .eq('venue_id', params.venue_id)
        .gte('business_date', minDate)
        .lte('business_date', maxDate),
    ]);

    if (plannedError) throw plannedError;
    if (actualError) throw actualError;

    const weekMetrics = new Map<string, any>();
    for (const s of schedules) {
      weekMetrics.set(s.week_start_date, {
        week_start_date: s.week_start_date,
        week_end_date: s.week_end_date,
        schedule_id: s.id,
        schedule_status: s.status,
        generated_at: s.generated_at ?? s.created_at,
        planned_hours: 0,
        actual_hours: 0,
        planned_cost: 0,
        actual_cost: 0,
        planned_shifts: 0,
        actual_shifts: 0,
        planned_employees: new Set<string>(),
        actual_employees: new Set<string>(),
        positions: new Map<string, PositionBucket>(),
      });
    }

    for (const shift of plannedShifts || []) {
      const schedule = scheduleById.get(shift.schedule_id);
      if (!schedule) continue;
      const week = weekMetrics.get(schedule.week_start_date);
      if (!week) continue;

      const hours = safeNum(shift.scheduled_hours);
      const cost = safeNum(shift.scheduled_cost) || (hours * safeNum(shift.hourly_rate));
      const posName = (shift.position as { name?: string } | null)?.name || `position:${shift.position_id}`;
      const bucket = week.positions.get(posName) || {
        planned_hours: 0, actual_hours: 0, planned_cost: 0, actual_cost: 0, planned_shifts: 0, actual_shifts: 0,
      };

      week.planned_hours += hours;
      week.planned_cost += cost;
      week.planned_shifts += 1;
      week.planned_employees.add(shift.employee_id);

      bucket.planned_hours += hours;
      bucket.planned_cost += cost;
      bucket.planned_shifts += 1;
      week.positions.set(posName, bucket);
    }

    for (const shift of actualShifts || []) {
      const weekKey = weekStartForDate(toDateOnly(shift.business_date));
      if (!weekStarts.has(weekKey)) continue;

      const week = weekMetrics.get(weekKey);
      if (!week) continue;

      const hours = inferredHours(shift);
      const cost = safeNum(shift.total_compensation) || (hours * safeNum(shift.hourly_rate));
      const posName = (shift.position as { name?: string } | null)?.name || `position:${shift.position_id}`;
      const bucket = week.positions.get(posName) || {
        planned_hours: 0, actual_hours: 0, planned_cost: 0, actual_cost: 0, planned_shifts: 0, actual_shifts: 0,
      };

      week.actual_hours += hours;
      week.actual_cost += cost;
      week.actual_shifts += 1;
      week.actual_employees.add(shift.employee_id);

      bucket.actual_hours += hours;
      bucket.actual_cost += cost;
      bucket.actual_shifts += 1;
      week.positions.set(posName, bucket);
    }

    const weekRows = Array.from(weekMetrics.values())
      .sort((a, b) => b.week_start_date.localeCompare(a.week_start_date))
      .map((w: any) => {
        const sharedEmployees = Array.from(w.planned_employees as Set<string>)
          .filter((id: string) => (w.actual_employees as Set<string>).has(id))
          .length;
        const hourDelta = w.planned_hours - w.actual_hours;
        const costDelta = w.planned_cost - w.actual_cost;
        const hourAbsPctError = w.actual_hours > 0 ? Math.abs(hourDelta) / w.actual_hours : 0;
        const costAbsPctError = w.actual_cost > 0 ? Math.abs(costDelta) / w.actual_cost : 0;

        const positions = Array.from((w.positions as Map<string, PositionBucket>).entries())
          .map(([position, p]) => ({
            position,
            planned_hours: Number(p.planned_hours.toFixed(2)),
            actual_hours: Number(p.actual_hours.toFixed(2)),
            delta_hours: Number((p.planned_hours - p.actual_hours).toFixed(2)),
            planned_cost: Number(p.planned_cost.toFixed(2)),
            actual_cost: Number(p.actual_cost.toFixed(2)),
            delta_cost: Number((p.planned_cost - p.actual_cost).toFixed(2)),
            planned_shifts: p.planned_shifts,
            actual_shifts: p.actual_shifts,
          }))
          .sort((a, b) => Math.abs(b.delta_hours) - Math.abs(a.delta_hours));

        return {
          week_start_date: w.week_start_date,
          week_end_date: w.week_end_date,
          schedule_id: w.schedule_id,
          schedule_status: w.schedule_status,
          generated_at: w.generated_at,
          planned_hours: Number(w.planned_hours.toFixed(2)),
          actual_hours: Number(w.actual_hours.toFixed(2)),
          delta_hours: Number(hourDelta.toFixed(2)),
          abs_pct_error_hours: Number(hourAbsPctError.toFixed(4)),
          planned_cost: Number(w.planned_cost.toFixed(2)),
          actual_cost: Number(w.actual_cost.toFixed(2)),
          delta_cost: Number(costDelta.toFixed(2)),
          abs_pct_error_cost: Number(costAbsPctError.toFixed(4)),
          planned_shifts: w.planned_shifts,
          actual_shifts: w.actual_shifts,
          planned_employee_count: (w.planned_employees as Set<string>).size,
          actual_employee_count: (w.actual_employees as Set<string>).size,
          shared_employee_count: sharedEmployees,
          coverage_alignment_score: Number(clamp01(1 - hourAbsPctError).toFixed(4)),
          cost_alignment_score: Number(clamp01(1 - costAbsPctError).toFixed(4)),
          positions,
        };
      });

    const aggregates = weekRows.reduce((acc, w) => {
      acc.planned_hours += w.planned_hours;
      acc.actual_hours += w.actual_hours;
      acc.planned_cost += w.planned_cost;
      acc.actual_cost += w.actual_cost;
      acc.mae_hours += Math.abs(w.delta_hours);
      acc.mae_cost += Math.abs(w.delta_cost);
      acc.mape_hours += w.abs_pct_error_hours;
      acc.mape_cost += w.abs_pct_error_cost;
      return acc;
    }, { planned_hours: 0, actual_hours: 0, planned_cost: 0, actual_cost: 0, mae_hours: 0, mae_cost: 0, mape_hours: 0, mape_cost: 0 });

    const n = Math.max(weekRows.length, 1);
    const summary = {
      weeks_analyzed: weekRows.length,
      planned_hours_total: Number(aggregates.planned_hours.toFixed(2)),
      actual_hours_total: Number(aggregates.actual_hours.toFixed(2)),
      delta_hours_total: Number((aggregates.planned_hours - aggregates.actual_hours).toFixed(2)),
      planned_cost_total: Number(aggregates.planned_cost.toFixed(2)),
      actual_cost_total: Number(aggregates.actual_cost.toFixed(2)),
      delta_cost_total: Number((aggregates.planned_cost - aggregates.actual_cost).toFixed(2)),
      mean_abs_error_hours: Number((aggregates.mae_hours / n).toFixed(2)),
      mean_abs_error_cost: Number((aggregates.mae_cost / n).toFixed(2)),
      mean_abs_pct_error_hours: Number((aggregates.mape_hours / n).toFixed(4)),
      mean_abs_pct_error_cost: Number((aggregates.mape_cost / n).toFixed(4)),
      overall_coverage_alignment_score: Number(clamp01(1 - (aggregates.mape_hours / n)).toFixed(4)),
      overall_cost_alignment_score: Number(clamp01(1 - (aggregates.mape_cost / n)).toFixed(4)),
    };

    return NextResponse.json({
      success: true,
      venue_id: params.venue_id,
      weeks_requested: weeks,
      end_date: params.end_date ?? null,
      data_source: {
        planned: 'weekly_schedules + shift_assignments',
        actual: 'actual_shifts_worked (7shifts sync)',
      },
      summary,
      weeks: weekRows,
    });
  });
}
