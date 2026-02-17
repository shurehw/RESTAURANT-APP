/**
 * Lightweight TypeScript scheduler for Vercel (no Python dependency).
 * Uses covers from demand_forecasts table (ML model per-venue, per-date predictions).
 * Falls back to DOW_FALLBACK if no forecast data found for a date.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';

// Fallback DOW covers used only when demand_forecasts has no data for a date
// (Delilah LA P75+10% baseline from historical server_day_facts)
const DOW_FALLBACK: Record<number, { covers: number; revenue: number }> = {
  0: { covers: 627, revenue: 75000 },  // Sun
  1: { covers: 0, revenue: 0 },        // Mon (closed)
  2: { covers: 120, revenue: 15000 },   // Tue
  3: { covers: 196, revenue: 22000 },   // Wed
  4: { covers: 223, revenue: 28000 },   // Thu
  5: { covers: 541, revenue: 65000 },   // Fri
  6: { covers: 675, revenue: 80000 },   // Sat
};

// Position configs: CPLH, shift times, calculation method
interface PosConfig {
  cplh?: number;
  ratio?: number;
  fixed?: boolean;
  shiftHours: number;
  start: string;
  end: string;
}

const POS_CONFIG: Record<string, PosConfig> = {
  'Server':            { cplh: 18,  shiftHours: 6.5,  start: '16:30', end: '23:00' },
  'Bartender':         { cplh: 30,  shiftHours: 8.5,  start: '15:00', end: '23:30' },
  'Busser':            { cplh: 35,  shiftHours: 6.5,  start: '16:30', end: '23:00' },
  'Food Runner':       { cplh: 30,  shiftHours: 6.0,  start: '17:00', end: '23:00' },
  'Host':              { ratio: 250, shiftHours: 6.0,  start: '16:30', end: '22:30' },
  'Line Cook':         { cplh: 22,  shiftHours: 8.0,  start: '15:00', end: '23:00' },
  'Prep Cook':         { cplh: 50,  shiftHours: 7.0,  start: '14:00', end: '21:00' },
  'Dishwasher':        { ratio: 200, shiftHours: 8.5,  start: '15:00', end: '23:30' },
  'Sous Chef':         { fixed: true, shiftHours: 9.0,  start: '14:00', end: '23:00' },
  'Executive Chef':    { fixed: true, shiftHours: 8.0,  start: '15:00', end: '23:00' },
  'General Manager':   { fixed: true, shiftHours: 10.0, start: '14:00', end: '00:00' },
  'Assistant Manager': { fixed: true, shiftHours: 9.0,  start: '15:00', end: '00:00' },
  'Shift Manager':     { cplh: 100, shiftHours: 8.0,  start: '16:00', end: '00:00' },
};

function calcNeeded(covers: number, config: PosConfig): number {
  if (covers === 0) return 0;
  if (config.fixed) return 1;
  if (config.ratio) return Math.ceil(covers / config.ratio);
  if (config.cplh) return Math.ceil(covers / (config.cplh * config.shiftHours));
  return 0;
}

export async function generateScheduleTS(
  venueId: string,
  weekStart: string,
  save: boolean
): Promise<{ scheduleId: string | null; shiftCount: number; totalHours: number; totalCost: number }> {
  const admin = createAdminClient();

  // Fetch positions for this venue
  const { data: positions } = await admin
    .from('positions')
    .select('id, name, category, base_hourly_rate')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (!positions || positions.length === 0) throw new Error('No active positions found');

  // Fetch active employees
  const { data: employees } = await admin
    .from('employees')
    .select('id, first_name, last_name, primary_position_id, max_hours_per_week')
    .eq('venue_id', venueId)
    .eq('employment_status', 'active');

  if (!employees || employees.length === 0) throw new Error('No active employees found');

  // Build position map
  const posMap = new Map(positions.map(p => [p.id, p]));
  const posNameMap = new Map(positions.map(p => [p.name, p]));

  // Group employees by position name
  const empByPos = new Map<string, typeof employees>();
  for (const emp of employees) {
    const pos = posMap.get(emp.primary_position_id);
    if (!pos) continue;
    const list = empByPos.get(pos.name) || [];
    list.push(emp);
    empByPos.set(pos.name, list);
  }

  // Generate 7 days of the week
  const startDate = new Date(weekStart + 'T00:00:00Z');
  const weekDays: { date: string; dow: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    weekDays.push({
      date: d.toISOString().split('T')[0],
      dow: d.getUTCDay(),
    });
  }

  // Fetch covers from demand_forecasts for this venue + week.
  // Multiple forecast runs may exist per date — use only the most recently generated
  // one per business_date (order by forecast_date DESC, keep first seen per date).
  const dateCoversMap: Record<string, { covers: number; revenue: number }> = {};
  const { data: forecasts } = await admin
    .from('demand_forecasts')
    .select('business_date, forecast_date, covers_predicted, revenue_predicted')
    .eq('venue_id', venueId)
    .in('business_date', weekDays.map(d => d.date))
    .order('business_date')
    .order('forecast_date', { ascending: false }); // latest forecast run first

  for (const f of forecasts || []) {
    // Skip if we already have the latest forecast for this date
    if (dateCoversMap[f.business_date]) continue;
    dateCoversMap[f.business_date] = {
      covers: Number(f.covers_predicted) || 0,
      revenue: Number(f.revenue_predicted) || 0,
    };
  }

  const hasForecastData = Object.keys(dateCoversMap).length > 0;

  // Delete existing schedule for this week/venue
  if (save) {
    const { data: existing } = await admin
      .from('weekly_schedules')
      .select('id')
      .eq('venue_id', venueId)
      .eq('week_start_date', weekStart);

    for (const sched of existing || []) {
      await admin.from('shift_assignments').delete().eq('schedule_id', sched.id);
      await admin.from('weekly_schedules').delete().eq('id', sched.id);
    }
  }

  // Track hours per employee for the week
  const empHours = new Map<string, number>();
  const empDays = new Map<string, Set<string>>();
  const shifts: any[] = [];
  let totalHours = 0;
  let totalCost = 0;
  let totalCovers = 0;
  let totalRevenue = 0;

  // For each day, calculate requirements and assign
  for (const day of weekDays) {
    // Use demand_forecasts if available, else fall back to DOW_FALLBACK
    const forecast = hasForecastData
      ? (dateCoversMap[day.date] ?? null)
      : (DOW_FALLBACK[day.dow] ?? null);

    if (!forecast || forecast.covers === 0) continue; // no forecast or closed day

    totalCovers += forecast.covers;
    totalRevenue += forecast.revenue;

    // Calculate needs per position
    for (const [posName, config] of Object.entries(POS_CONFIG)) {
      const needed = calcNeeded(forecast.covers, config);
      if (needed === 0) continue;

      const posInfo = posNameMap.get(posName);
      if (!posInfo) continue;

      const pool = empByPos.get(posName) || [];
      if (pool.length === 0) continue;

      // Sort by hours worked (least hours first for balance)
      pool.sort((a, b) => (empHours.get(a.id) || 0) - (empHours.get(b.id) || 0));

      let assigned = 0;
      for (const emp of pool) {
        if (assigned >= needed) break;

        // Skip if already worked this day
        const days = empDays.get(emp.id) || new Set();
        if (days.has(day.date)) continue;

        // Skip if over weekly hours
        const currentHours = empHours.get(emp.id) || 0;
        if (!config.fixed && currentHours + config.shiftHours > (emp.max_hours_per_week || 40)) continue;

        // Assign shift
        shifts.push({
          venue_id: venueId,
          employee_id: emp.id,
          position_id: posInfo.id,
          business_date: day.date,
          shift_type: 'dinner',
          scheduled_start: `${day.date}T${config.start}:00`,
          scheduled_end: `${day.date}T${config.end}:00`,
          scheduled_hours: config.shiftHours,
          hourly_rate: posInfo.base_hourly_rate,
          scheduled_cost: config.shiftHours * posInfo.base_hourly_rate,
          status: 'scheduled',
        });

        empHours.set(emp.id, currentHours + config.shiftHours);
        days.add(day.date);
        empDays.set(emp.id, days);
        totalHours += config.shiftHours;
        totalCost += config.shiftHours * posInfo.base_hourly_rate;
        assigned++;
      }
    }
  }

  let scheduleId: string | null = null;

  if (save && shifts.length > 0) {
    const weekEnd = new Date(startDate);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

    // Create schedule record
    const { data: sched, error: schedErr } = await admin
      .from('weekly_schedules')
      .insert({
        venue_id: venueId,
        week_start_date: weekStart,
        week_end_date: weekEnd.toISOString().split('T')[0],
        status: 'draft',
        total_labor_hours: Math.round(totalHours * 100) / 100,
        total_labor_cost: Math.round(totalCost * 100) / 100,
        overall_cplh: totalHours > 0 ? Math.round((totalCovers / totalHours) * 100) / 100 : 0,
        projected_revenue: totalRevenue,
        service_quality_score: 0.4,
        optimization_mode: 'balanced',
        auto_generated: true,
      })
      .select('id')
      .single();

    if (schedErr) throw schedErr;
    scheduleId = sched.id;

    // Insert shifts in batches
    const shiftsWithScheduleId = shifts.map(s => ({ ...s, schedule_id: scheduleId }));
    const batchSize = 50;
    for (let i = 0; i < shiftsWithScheduleId.length; i += batchSize) {
      const batch = shiftsWithScheduleId.slice(i, i + batchSize);
      const { error: shiftErr } = await admin.from('shift_assignments').insert(batch);
      if (shiftErr) throw shiftErr;
    }
  }

  return { scheduleId, shiftCount: shifts.length, totalHours, totalCost };
}
