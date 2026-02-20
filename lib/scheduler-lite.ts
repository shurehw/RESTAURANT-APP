/**
 * Lightweight TypeScript scheduler for Vercel (no Python dependency).
 *
 * Demand-driven staggered wave scheduling:
 * - Headcount sized from peak-hour demand (covers × peakPct / cplh)
 * - Staff spread across early / main / late shift waves
 * - Shorter, targeted shifts replace one long block per person
 * - Uses covers exclusively from demand_forecasts table (ML model per-venue, per-date).
 * - Days with no forecast data are skipped (no hardcoded fallback).
 */

import { createAdminClient } from '@/lib/supabase/server';

// ── Types ─────────────────────────────────────────────────────────────────────

type ShiftType = 'breakfast' | 'lunch' | 'dinner' | 'late_night';

interface ShiftTemplate {
  label: string;   // 'early' | 'main' | 'late' | 'prep' | 'day' | 'night' etc.
  type: ShiftType; // stored in shift_assignments.shift_type
  start: string;   // HH:MM (24h)
  end: string;     // HH:MM (24h — may be < start for midnight-crossing shifts)
  hours: number;   // shift length in decimal hours
}

interface PosConfig {
  cplh?: number;          // covers per labor hour (variable-demand positions)
  ratio?: number;         // daily covers per 1 employee (host, dishwasher)
  fixed?: boolean;        // always schedule 1 person regardless of covers
  peakPct: number;        // fraction of daily covers in the single busiest hour
  templates: ShiftTemplate[]; // [early, main, late] wave definitions
  useBarModel?: boolean;  // true = use composite bev-driven model (Bartender)
}

// ── Bartender Composite Model ────────────────────────────────────────────────
// The bar is a production center for the entire restaurant. Every cover
// generates drink orders regardless of where they sit. Bartender headcount
// should scale with drink volume, not raw covers.
//
// Formula: peakBartenders = ceil(covers × drinksPerCover × peakPct / DPLH)
//   drinksPerCover = venue_bev_pct / INDUSTRY_AVG_BEV_PCT × BASELINE_DRINKS_PER_COVER
//   DPLH = drinks per labor hour (throughput ceiling per bartender)

/** Industry average beverage percentage across full-service restaurants */
const INDUSTRY_AVG_BEV_PCT = 0.30;

/** Baseline drinks ordered per cover at an average full-service venue (at 30% bev) */
const BASELINE_DRINKS_PER_COVER = 2.0;

/**
 * Drinks per labor hour at PEAK — how many drinks one bartender can produce
 * in their busiest hour (with barback support where applicable).
 * This is peak throughput, not all-shift average.
 * Tuned by venue class: craft cocktail bars are slower, beer/wine pours are faster.
 */
const VENUE_CLASS_DPLH: Record<string, number> = {
  supper_club:     40,  // Craft cocktails + wine service, slower per drink
  high_end_social: 38,  // Heavy cocktail program
  nightclub:       55,  // High-volume pours, simpler drinks, bottle service
  late_night:      55,
  member_club:     42,  // Mixed — cocktails + wine
};
const DEFAULT_DPLH = 45;

/** Bev intensity by DOW for a venue — maps dow (0=Sun..6=Sat) to beverage_pct */
type BevIntensityMap = Map<number, number>;

// ── Constants ─────────────────────────────────────────────────────────────────

/** 22% of daily covers typically land in the single busiest dinner hour */
const PEAK_PCT = 0.22;

/**
 * Position wave configs for Hwood Group venues.
 * CPLH values derived from actual labor_day_facts data (60% venue data + 40% industry).
 * Each position lists 1–3 shift templates (early / main / late waves).
 * Staff headcount at peak drives how many of each wave to schedule.
 */
const POS_CONFIG: Record<string, PosConfig> = {
  // ── Front of House ──────────────────────────────────────────────────────
  'Server': {
    cplh: 13,       // Derived: LA=12.9 Miami=13.0 (industry 18, actual ~10)
    peakPct: PEAK_PCT,
    templates: [
      { label: 'early', type: 'dinner',     start: '16:30', end: '21:00', hours: 4.5 },
      { label: 'main',  type: 'dinner',     start: '17:30', end: '22:00', hours: 4.5 },
      { label: 'late',  type: 'late_night', start: '19:00', end: '23:30', hours: 4.5 },
    ],
  },
  'Bartender': {
    cplh: 22,           // Fallback CPLH (only used if bar model data unavailable)
    peakPct: PEAK_PCT,
    useBarModel: true,  // Use composite bev-driven model instead of flat CPLH
    templates: [
      { label: 'day',   type: 'lunch',      start: '14:00', end: '20:00', hours: 6.0 },
      { label: 'night', type: 'late_night', start: '18:00', end: '00:00', hours: 6.0 },
    ],
  },
  'Busser': {
    cplh: 28,       // Derived: LA=36.9 Miami=19.8 (industry 35, blended 28)
    peakPct: PEAK_PCT,
    templates: [
      { label: 'early', type: 'dinner',     start: '16:30', end: '21:00', hours: 4.5 },
      { label: 'late',  type: 'late_night', start: '18:30', end: '23:00', hours: 4.5 },
    ],
  },
  'Food Runner': {
    cplh: 25,       // Derived: LA=25.7 Miami=25.0 (industry 30, actual ~22)
    peakPct: PEAK_PCT,
    templates: [
      { label: 'early', type: 'dinner',     start: '17:00', end: '21:00', hours: 4.0 },
      { label: 'late',  type: 'late_night', start: '18:30', end: '23:00', hours: 4.5 },
    ],
  },
  'Host': {
    cplh: 28,       // Derived: LA=38.1 Miami=17.3 (was ratio 1:250, now CPLH-based)
    peakPct: PEAK_PCT,
    templates: [
      { label: 'early', type: 'dinner',     start: '16:30', end: '21:00', hours: 4.5 },
      { label: 'late',  type: 'late_night', start: '18:00', end: '23:00', hours: 5.0 },
    ],
  },

  // ── Back of House ───────────────────────────────────────────────────────
  'Line Cook': {
    cplh: 21,       // Derived: LA=24.6 Miami=17.4 (industry 22, very close)
    peakPct: PEAK_PCT,
    templates: [
      { label: 'prep',  type: 'lunch',      start: '13:00', end: '19:00', hours: 6.0 },
      { label: 'early', type: 'dinner',     start: '15:00', end: '21:00', hours: 6.0 },
      { label: 'late',  type: 'late_night', start: '17:00', end: '23:00', hours: 6.0 },
    ],
  },
  'Prep Cook': {
    cplh: 40,       // Derived: LA=50.9 Miami=28.6 (industry 50, actual ~40)
    peakPct: 0.15,  // prep demand peaks before service
    templates: [
      { label: 'am', type: 'breakfast', start: '09:00', end: '15:00', hours: 6.0 },
      { label: 'pm', type: 'lunch',     start: '12:00', end: '18:00', hours: 6.0 },
    ],
  },
  'Dishwasher': {
    cplh: 28,       // Derived: LA=26.4 Miami=29.3 (was ratio 1:200, now CPLH-based)
    peakPct: PEAK_PCT,
    templates: [
      { label: 'early', type: 'dinner',     start: '15:00', end: '21:00', hours: 6.0 },
      { label: 'late',  type: 'late_night', start: '18:00', end: '00:00', hours: 6.0 },
    ],
  },

  // ── Management (fixed: 1 per schedule day) ──────────────────────────────
  'Sous Chef': {
    fixed: true,
    peakPct: PEAK_PCT,
    templates: [
      { label: 'main', type: 'dinner', start: '12:00', end: '22:00', hours: 10.0 },
    ],
  },
  'Executive Chef': {
    fixed: true,
    peakPct: PEAK_PCT,
    templates: [
      { label: 'main', type: 'dinner', start: '11:00', end: '21:00', hours: 10.0 },
    ],
  },
  'General Manager': {
    fixed: true,
    peakPct: PEAK_PCT,
    templates: [
      { label: 'main', type: 'dinner', start: '13:00', end: '23:00', hours: 10.0 },
    ],
  },
  'Assistant Manager': {
    fixed: true,
    peakPct: PEAK_PCT,
    // Two waves for full coverage: one for opening, one for close
    templates: [
      { label: 'early', type: 'dinner',     start: '14:00', end: '22:00', hours: 8.0 },
      { label: 'late',  type: 'late_night', start: '17:00', end: '01:00', hours: 8.0 },
    ],
  },
  'Shift Manager': {
    cplh: 100,      // No venue data for mgmt; industry benchmark
    peakPct: PEAK_PCT,
    templates: [
      { label: 'main', type: 'dinner', start: '16:00', end: '00:00', hours: 8.0 },
    ],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** How many staff are needed to cover the peak hour for this position */
function calcPeakStaff(covers: number, config: PosConfig, cplhOverride?: number): number {
  if (covers === 0) return 0;
  if (config.fixed) return 1;
  const cplh = cplhOverride || config.cplh;
  if (config.ratio && !cplhOverride) return Math.max(1, Math.ceil(covers / config.ratio));
  if (cplh) return Math.max(1, Math.ceil(covers * config.peakPct / cplh));
  return 0;
}

/** Minimum busy days needed to trust venue-derived CPLH */
const MIN_BUSY_DAYS = 10;

/**
 * Derive venue beverage intensity by day-of-week from venue_day_facts.
 * Returns a map of DOW (0=Sun..6=Sat) → avg beverage_pct (0-1).
 * Falls back to venue-class default if insufficient data.
 */
async function deriveVenueBevIntensity(
  admin: ReturnType<typeof createAdminClient>,
  venueId: string,
  venueClass: string | null,
): Promise<BevIntensityMap> {
  const result = new Map<number, number>();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  let data: any[] | null = null;
  try {
    const res = await admin.rpc('get_venue_bev_by_dow', {
      p_venue_id: venueId,
      p_cutoff: cutoffStr,
    });
    data = res.data;
  } catch { /* RPC may not exist yet */ }

  // If RPC doesn't exist yet, fall back to direct query
  if (!data) {
    const { data: facts } = await admin
      .from('venue_day_facts')
      .select('business_date, beverage_pct')
      .eq('venue_id', venueId)
      .gte('business_date', cutoffStr)
      .gt('beverage_pct', 0);

    if (facts && facts.length >= MIN_BUSY_DAYS) {
      // Group by DOW
      const dowBuckets: Record<number, number[]> = {};
      for (const f of facts) {
        const dow = new Date(f.business_date + 'T12:00:00').getUTCDay();
        if (!dowBuckets[dow]) dowBuckets[dow] = [];
        dowBuckets[dow].push(Number(f.beverage_pct) / 100); // stored as 0-100, convert to 0-1
      }
      for (const [dow, pcts] of Object.entries(dowBuckets)) {
        if (pcts.length >= 3) {
          result.set(Number(dow), pcts.reduce((s, v) => s + v, 0) / pcts.length);
        }
      }
    }
  } else {
    for (const row of data as any[]) {
      result.set(Number(row.dow), Number(row.avg_bev_pct));
    }
  }

  // Fall back to class default for missing DOWs
  const classDefault = getClassDefaultBevPct(venueClass);
  for (let dow = 0; dow <= 6; dow++) {
    if (!result.has(dow)) result.set(dow, classDefault);
  }

  return result;
}

/** Default bev% by venue class when no data available */
function getClassDefaultBevPct(venueClass: string | null): number {
  switch (venueClass) {
    case 'nightclub':
    case 'late_night':       return 0.85;
    case 'high_end_social':  return 0.53;
    case 'supper_club':      return 0.40;
    case 'member_club':      return 0.35;
    default:                 return INDUSTRY_AVG_BEV_PCT;
  }
}

/**
 * Composite bartender staffing model.
 * Uses venue bev intensity + DPLH throughput ceiling instead of flat CPLH.
 *
 * peakBartenders = ceil(covers × drinksPerCover × peakPct / DPLH)
 *   where drinksPerCover = (venue_bev_pct / industry_avg) × baseline_drinks
 */
function calcBarStaff(
  covers: number,
  bevPct: number,
  venueClass: string | null,
  peakPct: number,
): number {
  if (covers === 0) return 0;

  // Scale drinks per cover by venue bev intensity relative to industry average
  const bevMultiplier = bevPct / INDUSTRY_AVG_BEV_PCT;
  const drinksPerCover = bevMultiplier * BASELINE_DRINKS_PER_COVER;

  // Peak-hour drink demand
  const peakDrinks = covers * peakPct * drinksPerCover;

  // Throughput ceiling per bartender
  const dplh = VENUE_CLASS_DPLH[venueClass || ''] || DEFAULT_DPLH;

  return Math.max(1, Math.ceil(peakDrinks / dplh));
}

/**
 * Derive per-position peak-hour CPLH from this venue's actual labor data.
 * Uses labor_day_facts (FOH/BOH hours & employee counts) × employee pool
 * proportions to estimate per-position hours, then converts to peak-hour CPLH.
 * Blends 60% venue data + 40% POS_CONFIG defaults.
 * Returns empty map if insufficient data (< MIN_BUSY_DAYS).
 */
async function deriveVenueCPLH(
  admin: ReturnType<typeof createAdminClient>,
  venueId: string,
  positions: { id: string; name: string; category: string }[],
  employees: { id: string; primary_position_id: string }[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // Build position category and pool counts
  const posMap = new Map(positions.map(p => [p.id, p]));
  const posCounts: Record<string, number> = {};
  const posCategory: Record<string, string> = {};
  for (const emp of employees) {
    const pos = posMap.get(emp.primary_position_id);
    if (!pos) continue;
    posCounts[pos.name] = (posCounts[pos.name] || 0) + 1;
    posCategory[pos.name] = pos.category;
  }

  const fohNames = Object.keys(posCategory).filter(n => posCategory[n] === 'front_of_house');
  const bohNames = Object.keys(posCategory).filter(n => posCategory[n] === 'back_of_house');
  const fohPool = fohNames.reduce((s, n) => s + (posCounts[n] || 0), 0);
  const bohPool = bohNames.reduce((s, n) => s + (posCounts[n] || 0), 0);

  if (fohPool === 0 && bohPool === 0) return result;

  // Fetch busy-day labor data for this venue (covers > 100, last 90 days)
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: laborDays } = await admin
    .from('labor_day_facts')
    .select('covers, foh_hours, boh_hours, foh_employee_count, boh_employee_count')
    .eq('venue_id', venueId)
    .gt('covers', 100)
    .gte('business_date', cutoffStr)
    .order('business_date', { ascending: false })
    .limit(60);

  if (!laborDays || laborDays.length < MIN_BUSY_DAYS) return result;

  // Filter days with valid FOH/BOH data
  const validDays = laborDays.filter(
    d => d.foh_hours && d.foh_hours > 10 && d.boh_hours && d.boh_hours > 5
      && d.foh_employee_count && d.boh_employee_count,
  );
  if (validDays.length < MIN_BUSY_DAYS) return result;

  // Per-position: accumulate weighted stats across busy days
  const posStats: Record<string, { totalCoversWeighted: number; cplhSum: number }> = {};

  for (const day of validDays) {
    const covers = day.covers as number;
    const fohH = day.foh_hours as number;
    const bohH = day.boh_hours as number;
    const fohEmp = day.foh_employee_count as number;
    const bohEmp = day.boh_employee_count as number;

    const fohAvgShift = fohH / fohEmp;
    const bohAvgShift = bohH / bohEmp;

    for (const posName of [...fohNames, ...bohNames]) {
      const poolSize = posCounts[posName] || 0;
      if (poolSize === 0) continue;

      const isFoh = posCategory[posName] === 'front_of_house';
      const catPool = isFoh ? fohPool : bohPool;
      const catEmp = isFoh ? fohEmp : bohEmp;
      const avgShift = isFoh ? fohAvgShift : bohAvgShift;

      // Estimate staff count for this position on this day
      const estStaff = Math.max(1, Math.round(poolSize / catPool * catEmp));
      const estHours = estStaff * avgShift;
      if (estHours <= 0) continue;

      // All-day CPLH for this position
      const allDayCplh = covers / estHours;
      // Convert to peak-hour CPLH: peak = allDay × avgShift × PEAK_PCT
      const peakCplh = allDayCplh * avgShift * PEAK_PCT;

      if (!posStats[posName]) posStats[posName] = { totalCoversWeighted: 0, cplhSum: 0 };
      posStats[posName].totalCoversWeighted += covers;
      posStats[posName].cplhSum += peakCplh * covers; // cover-weighted sum
    }
  }

  // Blend: 40% venue-derived + 60% industry default (industry-weighted)
  for (const [posName, stats] of Object.entries(posStats)) {
    if (stats.totalCoversWeighted === 0) continue;
    const derivedPeak = stats.cplhSum / stats.totalCoversWeighted;
    if (derivedPeak <= 0) continue;

    const defaultCplh = POS_CONFIG[posName]?.cplh;
    const blended = defaultCplh
      ? Math.round(derivedPeak * 0.4 + defaultCplh * 0.6)
      : Math.round(derivedPeak);

    if (blended > 0) result.set(posName, blended);
  }

  return result;
}

/**
 * Split peakStaff across the position's wave templates.
 * Fixed positions always get 1 person per template (for full-day coverage).
 * Variable positions: ~40/60 for 2 templates, ~25/50/25 for 3 templates.
 */
function distributeWaves(
  peakStaff: number,
  config: PosConfig,
): { template: ShiftTemplate; count: number }[] {
  const { templates, fixed } = config;

  if (peakStaff === 0) return [];

  // Fixed positions: 1 person per template (e.g., AM + PM manager)
  if (fixed) {
    return templates.map(t => ({ template: t, count: 1 }));
  }

  // Single template — all staff go here
  if (templates.length === 1) {
    return [{ template: templates[0], count: peakStaff }];
  }

  // Two templates: 40% early / 60% late
  if (templates.length === 2) {
    const earlyCount = Math.max(1, Math.floor(peakStaff * 0.4));
    const lateCount  = peakStaff - earlyCount;
    const result: { template: ShiftTemplate; count: number }[] = [];
    if (earlyCount > 0) result.push({ template: templates[0], count: earlyCount });
    if (lateCount  > 0) result.push({ template: templates[1], count: lateCount });
    return result;
  }

  // Three templates: 25% early / 50% main / 25% late
  if (peakStaff === 1) {
    // Single staff member → use middle (main) wave
    return [{ template: templates[1], count: 1 }];
  }
  if (peakStaff === 2) {
    // 1 early + 1 late (skip main — gives spread coverage)
    return [
      { template: templates[0], count: 1 },
      { template: templates[2], count: 1 },
    ];
  }
  const earlyCount = Math.max(1, Math.floor(peakStaff * 0.25));
  const lateCount  = Math.max(1, Math.floor(peakStaff * 0.25));
  const mainCount  = peakStaff - earlyCount - lateCount;
  const result: { template: ShiftTemplate; count: number }[] = [];
  if (earlyCount > 0) result.push({ template: templates[0], count: earlyCount });
  if (mainCount  > 0) result.push({ template: templates[1], count: mainCount });
  if (lateCount  > 0) result.push({ template: templates[2], count: lateCount });
  return result;
}

/** Returns the date string for the day after `date` (for midnight-crossing shifts) */
function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

// ── Main Scheduler ────────────────────────────────────────────────────────────

export async function generateScheduleTS(
  venueId: string,
  weekStart: string,
  save: boolean,
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

  // Build lookup maps
  const posMap     = new Map(positions.map(p => [p.id, p]));
  const posNameMap = new Map(positions.map(p => [p.name, p]));

  // Group employees by their position name
  const empByPos = new Map<string, typeof employees>();
  for (const emp of employees) {
    const pos = posMap.get(emp.primary_position_id);
    if (!pos) continue;
    const list = empByPos.get(pos.name) || [];
    list.push(emp);
    empByPos.set(pos.name, list);
  }

  // Derive venue-specific CPLH from actual labor data (falls back to defaults)
  const venueCPLH = await deriveVenueCPLH(admin, venueId, positions, employees);

  // Fetch venue class for bar model calibration
  const { data: venueRow } = await admin
    .from('venues')
    .select('venue_class')
    .eq('id', venueId)
    .single();
  const venueClass: string | null = venueRow?.venue_class ?? null;

  // Derive bev intensity by DOW for composite bartender model
  const bevIntensity = await deriveVenueBevIntensity(admin, venueId, venueClass);

  // Build the 7 days of the week
  const startDate = new Date(weekStart + 'T00:00:00Z');
  const weekDays: { date: string; dow: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    weekDays.push({ date: d.toISOString().split('T')[0], dow: d.getUTCDay() });
  }

  // Fetch covers from forecasts_with_bias only (matches Forecasts page exactly)
  const dateCoversMap: Record<string, { covers: number; revenue: number }> = {};

  const { data: biasForecasts } = await admin
    .from('forecasts_with_bias')
    .select('business_date, covers_predicted, revenue_predicted')
    .eq('venue_id', venueId)
    .in('business_date', weekDays.map(d => d.date))
    .gt('covers_predicted', 0)
    .order('business_date');

  for (const f of biasForecasts || []) {
    if (dateCoversMap[f.business_date]) continue;
    dateCoversMap[f.business_date] = {
      covers: Number(f.covers_predicted) || 0,
      revenue: Number(f.revenue_predicted) || 0,
    };
  }

  // Delete any existing schedule for this venue + week
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

  // Track per-employee hours and worked days for the week
  const empHours = new Map<string, number>();
  const empDays  = new Map<string, Set<string>>();
  const shifts: any[] = [];
  let totalHours = 0;
  let totalCost  = 0;
  let totalCovers  = 0;
  let totalRevenue = 0;

  // ── Per-day scheduling (uses demand_forecasts covers only) ────────────
  for (const day of weekDays) {
    const forecast = dateCoversMap[day.date] ?? null;

    if (!forecast || forecast.covers === 0) continue;

    totalCovers  += forecast.covers;
    totalRevenue += forecast.revenue;

    // ── Per-position wave assignment ──────────────────────────────────────
    for (const [posName, config] of Object.entries(POS_CONFIG)) {
      let peakStaff: number;

      if (config.useBarModel) {
        // Composite bartender model: covers × bev intensity × peak_pct / DPLH
        const bevPct = bevIntensity.get(day.dow) ?? INDUSTRY_AVG_BEV_PCT;
        peakStaff = calcBarStaff(forecast.covers, bevPct, venueClass, config.peakPct);
      } else {
        const cplhOverride = venueCPLH.get(posName);
        peakStaff = calcPeakStaff(forecast.covers, config, cplhOverride);
      }
      if (peakStaff === 0) continue;

      const posInfo = posNameMap.get(posName);
      if (!posInfo) continue;

      const pool = empByPos.get(posName) || [];
      if (pool.length === 0) continue;

      const waves = distributeWaves(peakStaff, config);

      // ── Per-wave assignment ─────────────────────────────────────────────
      for (const wave of waves) {
        // Sort by fewest hours worked first (load balancing)
        pool.sort((a, b) => (empHours.get(a.id) || 0) - (empHours.get(b.id) || 0));

        let waveAssigned = 0;

        for (const emp of pool) {
          if (waveAssigned >= wave.count) break;

          // Skip if already scheduled on this day
          const days = empDays.get(emp.id) || new Set<string>();
          if (days.has(day.date)) continue;

          // Skip if shift would push over weekly hour cap (non-fixed positions)
          const currentHours = empHours.get(emp.id) || 0;
          if (!config.fixed && currentHours + wave.template.hours > (emp.max_hours_per_week || 40)) continue;

          // Determine end date (handles shifts that cross midnight)
          const endDate = wave.template.end <= wave.template.start
            ? nextDay(day.date)
            : day.date;

          const shiftCost = wave.template.hours * posInfo.base_hourly_rate;

          shifts.push({
            venue_id:         venueId,
            employee_id:      emp.id,
            position_id:      posInfo.id,
            business_date:    day.date,
            shift_type:       wave.template.type,
            scheduled_start:  `${day.date}T${wave.template.start}:00`,
            scheduled_end:    `${endDate}T${wave.template.end}:00`,
            scheduled_hours:  wave.template.hours,
            hourly_rate:      posInfo.base_hourly_rate,
            scheduled_cost:   shiftCost,
            status:           'scheduled',
          });

          empHours.set(emp.id, currentHours + wave.template.hours);
          days.add(day.date);
          empDays.set(emp.id, days);
          totalHours += wave.template.hours;
          totalCost  += shiftCost;
          waveAssigned++;
        }
      }
    }
  }

  // ── Save to DB ────────────────────────────────────────────────────────────
  let scheduleId: string | null = null;

  if (save && shifts.length > 0) {
    const weekEnd = new Date(startDate);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

    const { data: sched, error: schedErr } = await admin
      .from('weekly_schedules')
      .insert({
        venue_id:            venueId,
        week_start_date:     weekStart,
        week_end_date:       weekEnd.toISOString().split('T')[0],
        status:              'draft',
        total_labor_hours:   Math.round(totalHours * 100) / 100,
        total_labor_cost:    Math.round(totalCost * 100) / 100,
        overall_cplh:        totalHours > 0
                               ? Math.round((totalCovers / totalHours) * 100) / 100
                               : 0,
        projected_revenue:   totalRevenue,
        service_quality_score: 0.4,
        optimization_mode:   'balanced',
        auto_generated:      true,
      })
      .select('id')
      .single();

    if (schedErr) throw schedErr;
    scheduleId = sched.id;

    // Insert shifts in batches of 50
    const shiftsWithId = shifts.map(s => ({ ...s, schedule_id: scheduleId }));
    const batchSize = 50;
    for (let i = 0; i < shiftsWithId.length; i += batchSize) {
      const { error: shiftErr } = await admin
        .from('shift_assignments')
        .insert(shiftsWithId.slice(i, i + batchSize));
      if (shiftErr) throw shiftErr;
    }
  }

  return { scheduleId, shiftCount: shifts.length, totalHours, totalCost };
}
