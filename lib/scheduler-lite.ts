/**
 * Lightweight TypeScript scheduler for Vercel (no Python dependency).
 *
 * Demand-driven staggered wave scheduling:
 * - Shift times derived from actual guest arrival curves (demand_distribution_curves)
 *   or venue open/close hours from location_config — never hardcoded.
 * - Admin overrides (schedule_position_overrides table) take priority when set.
 * - Headcount sized from peak-hour demand (covers x peakPct / cplh).
 * - Staff spread across early / main / late shift waves.
 * - FOH minimum shift = 6 hours, BOH minimum shift = 5 hours.
 * - Bartender model accounts for bar-only guests (bar_guest_pct).
 * - CPLH priority: admin override > venue-derived (40% venue + 60% industry) > default.
 * - Uses covers exclusively from forecasts_with_bias table.
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
  cplh?: number;
  ratio?: number;
  fixed?: boolean;
  peakPct: number;
  category: 'front_of_house' | 'back_of_house' | 'management';
  templates?: ShiftTemplate[]; // Fallback only — normally built dynamically
  useBarModel?: boolean;
}

interface AdminOverride {
  position_name: string;
  shift_start: string | null;
  shift_end: string | null;
  min_shift_hours: number;
  cplh_override: number | null;
  min_staff: number;
  max_staff: number | null;
  bar_guest_pct: number;
}

interface VenueHours {
  open: number;  // 0-23 (hour guests start arriving)
  close: number; // 0-23 (may be < open for after-midnight venues)
}

interface DemandInterval {
  interval_start: string; // HH:MM:SS
  pct_of_daily_covers: number;
}

// ── Bartender Composite Model ────────────────────────────────────────────────

const INDUSTRY_AVG_BEV_PCT = 0.30;
const BASELINE_DRINKS_PER_COVER = 2.0;

const VENUE_CLASS_DPLH: Record<string, number> = {
  supper_club:     40,
  high_end_social: 38,
  nightclub:       55,
  late_night:      55,
  member_club:     42,
};
const DEFAULT_DPLH = 45;

type BevIntensityMap = Map<number, number>;

// ── Constants ─────────────────────────────────────────────────────────────────

const PEAK_PCT = 0.22;
const FOH_MIN_SHIFT_HOURS = 6.0;
const BOH_MIN_SHIFT_HOURS = 5.0;

/**
 * Position configs with CPLH defaults and category.
 * Templates are NO LONGER hardcoded — they are built dynamically
 * from venue hours + demand curves at schedule generation time.
 */
const POS_CONFIG: Record<string, PosConfig> = {
  // ── Front of House ──────────────────────────────────────────────────────
  'Server':      { cplh: 13, peakPct: PEAK_PCT, category: 'front_of_house' },
  'Bartender':   { cplh: 22, peakPct: PEAK_PCT, category: 'front_of_house', useBarModel: true },
  'Busser':      { cplh: 28, peakPct: PEAK_PCT, category: 'front_of_house' },
  'Food Runner': { cplh: 25, peakPct: PEAK_PCT, category: 'front_of_house' },
  'Host':        { cplh: 28, peakPct: PEAK_PCT, category: 'front_of_house' },
  'Barback':     { cplh: 35, peakPct: PEAK_PCT, category: 'front_of_house' },
  // ── Back of House ───────────────────────────────────────────────────────
  'Line Cook':   { cplh: 21, peakPct: PEAK_PCT, category: 'back_of_house' },
  'Prep Cook':   { cplh: 40, peakPct: 0.15,     category: 'back_of_house' },
  'Dishwasher':  { cplh: 28, peakPct: PEAK_PCT, category: 'back_of_house' },
  // ── Management (fixed: 1 per schedule day) ──────────────────────────────
  'Sous Chef':         { fixed: true, peakPct: PEAK_PCT, category: 'management' },
  'Executive Chef':    { fixed: true, peakPct: PEAK_PCT, category: 'management' },
  'General Manager':   { fixed: true, peakPct: PEAK_PCT, category: 'management' },
  'Assistant Manager': { fixed: true, peakPct: PEAK_PCT, category: 'management' },
  'Shift Manager':     { cplh: 100,  peakPct: PEAK_PCT, category: 'management' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map JS day-of-week (0=Sun) to demand_distribution_curves.day_type */
function dowToDayType(dow: number): string {
  switch (dow) {
    case 0: return 'sunday';
    case 5: return 'friday';
    case 6: return 'saturday';
    default: return 'weekday'; // Mon-Thu
  }
}

/**
 * Walk 30-min demand intervals chronologically and find the decimal hour
 * where cumulative pct_of_daily_covers crosses the given threshold.
 *
 * For midnight-crossing venues (e.g. open=18, close=2), evening intervals
 * are sorted before after-midnight intervals.
 *
 * Returns null if curves are empty or threshold is never reached,
 * which triggers geometric midpoint fallback in the caller.
 */
function findDemandVelocitySplit(
  intervals: DemandInterval[],
  threshold: number,
  venueOpenHour: number,
): number | null {
  if (!intervals || intervals.length === 0) return null;

  // Sort so evening (>=12) comes before after-midnight (<6).
  // Within each group, sort by clock time ascending.
  const sorted = [...intervals].sort((a, b) => {
    const ha = parseInt(a.interval_start.split(':')[0], 10);
    const hb = parseInt(b.interval_start.split(':')[0], 10);
    const aIsEvening = ha >= 12;
    const bIsEvening = hb >= 12;
    if (aIsEvening && !bIsEvening) return -1;
    if (!aIsEvening && bIsEvening) return 1;
    const ma = parseInt(a.interval_start.split(':')[1] || '0', 10);
    const mb = parseInt(b.interval_start.split(':')[1] || '0', 10);
    return (ha * 60 + ma) - (hb * 60 + mb);
  });

  let cumulative = 0;
  for (const interval of sorted) {
    cumulative += interval.pct_of_daily_covers;
    if (cumulative >= threshold) {
      const h = parseInt(interval.interval_start.split(':')[0], 10);
      const m = parseInt(interval.interval_start.split(':')[1] || '0', 10);
      let decimalHour = h + m / 60;
      // After-midnight intervals: add 24 to stay consistent with effectiveClose convention
      if (decimalHour < 12 && venueOpenHour >= 12) {
        decimalHour += 24;
      }
      return decimalHour;
    }
  }
  return null;
}

/** Convert decimal hour (e.g. 18.5) to HH:MM string */
function hourToHHMM(h: number): string {
  const normalized = ((h % 24) + 24) % 24;
  const hh = Math.floor(normalized);
  const mm = Math.round((normalized % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * CA meal break deduction: unpaid breaks subtracted from paid hours.
 *   >6h  → 1 × 30-min break (0.5h)
 *   >10h → 2 × 30-min breaks (1.0h)
 * Shift start/end times stay the same — only paid hours change.
 */
function paidHours(grossHours: number): number {
  if (grossHours > 10) return grossHours - 1.0;
  if (grossHours > 6) return grossHours - 0.5;
  return grossHours;
}

/** Calculate shift hours between two HH:MM times, handling midnight crossing */
function calcShiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60; // crosses midnight
  return (endMin - startMin) / 60;
}

/** Classify shift time into ShiftType */
function classifyShiftType(startHour: number): ShiftType {
  const h = ((startHour % 24) + 24) % 24;
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'late_night';
}

/**
 * Build shift templates dynamically from venue hours and demand curves.
 *
 * For FOH: finds when guests actually arrive (first interval with >2% of covers)
 * and when they leave (last interval with >2%), then creates staggered waves.
 * For BOH: starts 2h before FOH (prep time), ends 1h after last guest.
 * For Management: full coverage from prep through close.
 *
 * If demand curves are available, uses those for precise timing.
 * Otherwise falls back to venue open/close hours from location_config.
 */
function buildTemplatesFromVenueHours(
  venueHours: VenueHours,
  category: 'front_of_house' | 'back_of_house' | 'management',
  posName: string,
  demandIntervals?: DemandInterval[],
  minShiftHours?: number,
): ShiftTemplate[] {
  let guestStart = venueHours.open;
  let guestEnd = venueHours.close;

  // Use demand curves to find actual guest arrival/departure times
  if (demandIntervals && demandIntervals.length > 0) {
    // Curves are stored as 0-1 fractions (e.g. 0.087 = 8.7% of daily covers)
    const significant = demandIntervals.filter(d => d.pct_of_daily_covers > 0.02);
    if (significant.length > 0) {
      // Intervals are sorted by clock time (00:00 before 18:00), but nightlife venues
      // have guests from e.g. 18:00 through 01:30. We need to separate "evening" intervals
      // (>= venue open hour) from "after-midnight" intervals (< venue open hour, typically < 6AM).
      const eveningIntervals = significant.filter(d => {
        const h = parseInt(d.interval_start.split(':')[0], 10);
        return h >= 12; // PM intervals
      });
      const afterMidnight = significant.filter(d => {
        const h = parseInt(d.interval_start.split(':')[0], 10);
        return h < 6; // after-midnight intervals (00:00 - 05:30)
      });

      if (eveningIntervals.length > 0) {
        guestStart = parseInt(eveningIntervals[0].interval_start.split(':')[0], 10);
      }
      if (afterMidnight.length > 0) {
        // Last after-midnight interval determines closing time
        const lastAM = afterMidnight[afterMidnight.length - 1];
        guestEnd = parseInt(lastAM.interval_start.split(':')[0], 10) + 1;
      } else if (eveningIntervals.length > 0) {
        // No after-midnight guests — close based on last evening interval
        const lastEve = eveningIntervals[eveningIntervals.length - 1];
        guestEnd = parseInt(lastEve.interval_start.split(':')[0], 10) + 1;
      }
    }
  }

  // Handle after-midnight venues (e.g. close=2 means 2AM)
  const effectiveClose = guestEnd <= guestStart ? guestEnd + 24 : guestEnd;
  const serviceSpan = effectiveClose - guestStart;

  if (category === 'management') {
    const mgrStart = guestStart - 2;
    const mgrEnd = effectiveClose + 1;
    const isDouble = serviceSpan > 8;

    if (posName === 'Assistant Manager' && isDouble) {
      const midpoint = mgrStart + Math.floor((mgrEnd - mgrStart) / 2);
      return [
        { label: 'early', type: classifyShiftType(mgrStart), start: hourToHHMM(mgrStart), end: hourToHHMM(midpoint), hours: midpoint - mgrStart },
        { label: 'late',  type: 'late_night', start: hourToHHMM(midpoint - 1), end: hourToHHMM(mgrEnd), hours: mgrEnd - midpoint + 1 },
      ];
    }
    const hours = Math.min(mgrEnd - mgrStart, 10);
    return [
      { label: 'main', type: classifyShiftType(mgrStart), start: hourToHHMM(mgrStart), end: hourToHHMM(mgrStart + hours), hours },
    ];
  }

  const minHours = minShiftHours ?? (category === 'front_of_house' ? FOH_MIN_SHIFT_HOURS : BOH_MIN_SHIFT_HOURS);

  if (category === 'back_of_house') {
    const bohStart = guestStart - 2;
    const bohEnd = effectiveClose + 1;
    const bohSpan = bohEnd - bohStart;

    if (posName === 'Prep Cook') {
      const prepStart = Math.max(bohStart - 2, 7);
      return [
        { label: 'am', type: 'breakfast', start: hourToHHMM(prepStart), end: hourToHHMM(prepStart + 6), hours: 6.0 },
        { label: 'pm', type: 'lunch',     start: hourToHHMM(guestStart - 1), end: hourToHHMM(guestStart + 5), hours: 6.0 },
      ];
    }

    if (bohSpan <= minHours + 2) {
      return [
        { label: 'main', type: classifyShiftType(bohStart), start: hourToHHMM(bohStart), end: hourToHHMM(bohEnd), hours: Math.max(minHours, bohSpan) },
      ];
    }
    const wave1Start = bohStart;
    const wave2Start = bohStart + Math.floor(bohSpan * 0.25);
    const wave3Start = bohStart + Math.floor(bohSpan * 0.5);
    return [
      { label: 'prep',  type: classifyShiftType(wave1Start), start: hourToHHMM(wave1Start), end: hourToHHMM(wave1Start + minHours), hours: minHours },
      { label: 'early', type: classifyShiftType(wave2Start), start: hourToHHMM(wave2Start), end: hourToHHMM(wave2Start + minHours), hours: minHours },
      { label: 'late',  type: 'late_night', start: hourToHHMM(wave3Start), end: hourToHHMM(bohEnd), hours: Math.max(minHours, bohEnd - wave3Start) },
    ];
  }

  // FOH positions — Bartender / Barback
  if (posName === 'Bartender' || posName === 'Barback') {
    const barStart = guestStart - 1.0;  // 1h setup (stock, prep, ice)
    const barEnd = effectiveClose;
    const barSpan = barEnd - barStart;

    // ≤10h service window (supper clubs, evening-only venues):
    // Opener arrives first for setup, cuts first (FIFO). Closer arrives
    // when demand builds, stays through close for breakdown.
    // distributeWaves 40/60 → fewer openers, more closers.
    if (barSpan <= 10) {
      // Closer start: when demand ramps (20% cumulative) or 1h after doors
      const BAR_CLOSER_START_THRESHOLD = 0.20;
      const velocityStart = findDemandVelocitySplit(demandIntervals ?? [], BAR_CLOSER_START_THRESHOLD, venueHours.open);
      let closerStart: number;
      if (velocityStart !== null) {
        closerStart = velocityStart;
        closerStart = Math.max(closerStart, barStart + 2);         // at least 2h after opener
        closerStart = Math.min(closerStart, barEnd - minHours);    // enough time before close
      } else {
        closerStart = guestStart + 1;  // 1h after doors open
      }

      // Closer stays through close for breakdown (cash out, clean, restock)
      const closerEnd = barEnd;

      // Opener end: demand-driven — cuts 30 min after closer arrives (handoff overlap),
      // or when 85% of covers have arrived, whichever is later. First in, first out.
      const BAR_OPENER_END_THRESHOLD = 0.85;
      const openerTail = findDemandVelocitySplit(demandIntervals ?? [], BAR_OPENER_END_THRESHOLD, venueHours.open);
      let openerEnd: number;
      if (openerTail !== null) {
        openerEnd = openerTail;
        openerEnd = Math.max(openerEnd, closerStart + 0.5);       // at least 30 min overlap with closer
        openerEnd = Math.max(openerEnd, barStart + minHours);      // minimum shift length
        openerEnd = Math.min(openerEnd, closerEnd);                 // never past closer
      } else {
        openerEnd = closerEnd;  // no curves → stay through close
      }

      return [
        { label: 'opener', type: classifyShiftType(barStart), start: hourToHHMM(barStart), end: hourToHHMM(openerEnd), hours: Math.max(minHours, openerEnd - barStart) },
        { label: 'closer', type: classifyShiftType(closerStart), start: hourToHHMM(closerStart), end: hourToHHMM(closerEnd), hours: Math.max(minHours, closerEnd - closerStart) },
      ];
    }

    // >10h service window (brunch-to-close, all-day venues):
    // True day/night split with demand-velocity-driven handoff.
    const BAR_SPLIT_THRESHOLD = 0.35;
    const velocitySplit = findDemandVelocitySplit(demandIntervals ?? [], BAR_SPLIT_THRESHOLD, venueHours.open);
    let nightStart: number;
    if (velocitySplit !== null) {
      nightStart = velocitySplit - 0.5;
      nightStart = Math.min(nightStart, barEnd - minHours);
      nightStart = Math.max(nightStart, barStart + 2);
    } else {
      nightStart = barStart + Math.floor(barSpan / 2);
    }

    return [
      { label: 'day',   type: classifyShiftType(barStart), start: hourToHHMM(barStart), end: hourToHHMM(barStart + minHours), hours: minHours },
      { label: 'night', type: 'late_night', start: hourToHHMM(nightStart), end: hourToHHMM(barEnd), hours: Math.max(minHours, barEnd - nightStart) },
    ];
  }

  // Generic FOH (Server, Busser, Food Runner, Host)
  const fohStart = guestStart - 0.5;
  const fohEnd = effectiveClose;
  const fohSpan = fohEnd - fohStart;

  if (fohSpan <= minHours + 1) {
    return [
      { label: 'main', type: classifyShiftType(fohStart), start: hourToHHMM(fohStart), end: hourToHHMM(fohEnd), hours: Math.max(minHours, fohSpan) },
    ];
  }

  if (fohSpan <= minHours * 2) {
    // 2-wave: demand-velocity at 40% cumulative covers
    const FOH_2WAVE_THRESHOLD = 0.40;
    const velocitySplit = findDemandVelocitySplit(demandIntervals ?? [], FOH_2WAVE_THRESHOLD, venueHours.open);
    let wave2Start: number;
    if (velocitySplit !== null) {
      wave2Start = velocitySplit - 0.5;
      wave2Start = Math.min(wave2Start, fohEnd - minHours);
      wave2Start = Math.max(wave2Start, fohStart + 2);  // overlap is intentional
    } else {
      wave2Start = fohEnd - minHours;
    }
    return [
      { label: 'early', type: classifyShiftType(fohStart), start: hourToHHMM(fohStart), end: hourToHHMM(fohStart + minHours), hours: minHours },
      { label: 'late',  type: 'late_night', start: hourToHHMM(wave2Start), end: hourToHHMM(fohEnd), hours: Math.max(minHours, fohEnd - wave2Start) },
    ];
  }

  // 3-wave: demand-velocity at 30% (wave 2) and 65% (wave 3)
  const FOH_WAVE2_THRESHOLD = 0.30;
  const FOH_WAVE3_THRESHOLD = 0.65;
  const velocity2 = findDemandVelocitySplit(demandIntervals ?? [], FOH_WAVE2_THRESHOLD, venueHours.open);
  const velocity3 = findDemandVelocitySplit(demandIntervals ?? [], FOH_WAVE3_THRESHOLD, venueHours.open);

  let wave2Start: number;
  if (velocity2 !== null) {
    wave2Start = velocity2 - 0.5;
    wave2Start = Math.max(wave2Start, fohStart + 1);
    wave2Start = Math.min(wave2Start, fohEnd - minHours * 2);
  } else {
    wave2Start = fohStart + Math.floor(fohSpan * 0.3);
  }

  let wave3Start: number;
  if (velocity3 !== null) {
    wave3Start = velocity3 - 0.5;
    wave3Start = Math.max(wave3Start, wave2Start + 2);  // overlap is intentional
    wave3Start = Math.min(wave3Start, fohEnd - minHours);
  } else {
    wave3Start = fohEnd - minHours;
  }

  return [
    { label: 'early', type: classifyShiftType(fohStart), start: hourToHHMM(fohStart), end: hourToHHMM(fohStart + minHours), hours: minHours },
    { label: 'main',  type: classifyShiftType(wave2Start), start: hourToHHMM(wave2Start), end: hourToHHMM(wave2Start + minHours), hours: minHours },
    { label: 'late',  type: 'late_night', start: hourToHHMM(wave3Start), end: hourToHHMM(fohEnd), hours: Math.max(minHours, fohEnd - wave3Start) },
  ];
}

/** Build templates from admin override (shift_start/shift_end directly). */
/** Normalize any time string to HH:MM:SS for valid timestamp construction.
 *  Handles: "18:30", "18:30:00", "03:05:00:00" (malformed), "3:5" etc. */
function normalizeTime(t: string): string {
  const parts = t.split(':').map(p => parseInt(p, 10) || 0);
  const hh = String(parts[0] ?? 0).padStart(2, '0');
  const mm = String(parts[1] ?? 0).padStart(2, '0');
  const ss = String(parts[2] ?? 0).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Format a date + time string into a valid ISO timestamp */
function toTimestamp(date: string, time: string): string {
  return `${date}T${normalizeTime(time)}`;
}

function buildTemplatesFromOverride(override: AdminOverride): ShiftTemplate[] {
  if (!override.shift_start || !override.shift_end) return [];
  const start = normalizeTime(override.shift_start);
  const end = normalizeTime(override.shift_end);
  const hours = calcShiftHours(start, end);
  const startHour = parseInt(start.split(':')[0], 10);
  return [
    { label: 'main', type: classifyShiftType(startHour), start, end, hours },
  ];
}

/**
 * Dwell-time multiplier: accounts for guests still seated from previous intervals.
 * With 90-min average dwell and 22% peak arrival rate, the peak hour has
 * new arrivals PLUS guests who arrived in the prior 1-2 half-hour slots
 * and are still occupying tables/seats.
 *
 * activePeakCovers = dailyCovers × peakPct × dwellMultiplier
 *
 * For a 90-min dwell: guests arriving at peak hour + ~60% of previous hour's arrivals
 * are still seated → multiplier ≈ 1.5.
 */
function getDwellMultiplier(dwellMinutes: number): number {
  if (dwellMinutes <= 30) return 1.0;
  if (dwellMinutes <= 60) return 1.2;
  if (dwellMinutes <= 90) return 1.5;
  if (dwellMinutes <= 120) return 1.7;
  return 1.8; // 2+ hour seatings
}

/**
 * How many staff are needed to cover the peak hour for this position.
 * dwellMultiplier adjusts for overlapping seated guests from previous intervals.
 */
function calcPeakStaff(covers: number, config: PosConfig, cplhOverride?: number, dwellMultiplier: number = 1.0): number {
  if (covers === 0) return 0;
  if (config.fixed) return 1;
  const cplh = cplhOverride || config.cplh;
  if (config.ratio && !cplhOverride) return Math.max(1, Math.ceil(covers * dwellMultiplier / config.ratio));
  if (cplh) return Math.max(1, Math.ceil(covers * config.peakPct * dwellMultiplier / cplh));
  return 0;
}

/** Minimum busy days needed to trust venue-derived CPLH */
const MIN_BUSY_DAYS = 10;

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

  if (!data) {
    const { data: facts } = await admin
      .from('venue_day_facts')
      .select('business_date, beverage_pct')
      .eq('venue_id', venueId)
      .gte('business_date', cutoffStr)
      .gt('beverage_pct', 0);

    if (facts && facts.length >= MIN_BUSY_DAYS) {
      const dowBuckets: Record<number, number[]> = {};
      for (const f of facts) {
        const dow = new Date(f.business_date + 'T12:00:00').getUTCDay();
        if (!dowBuckets[dow]) dowBuckets[dow] = [];
        dowBuckets[dow].push(Number(f.beverage_pct) / 100);
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

  const classDefault = getClassDefaultBevPct(venueClass);
  for (let dow = 0; dow <= 6; dow++) {
    if (!result.has(dow)) result.set(dow, classDefault);
  }

  return result;
}

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
 * Composite bartender staffing model with bar-only guest support.
 * barGuestPct adds additional bar-only guests (e.g. 0.15 = 15% extra covers as bar guests).
 * Bar guests drink ~3 drinks/person vs dining guests' ~2.
 */
function calcBarStaff(
  covers: number,
  bevPct: number,
  venueClass: string | null,
  peakPct: number,
  barGuestPct: number = 0,
  dwellMultiplier: number = 1.0,
): number {
  if (covers === 0) return 0;

  const bevMultiplier = bevPct / INDUSTRY_AVG_BEV_PCT;
  const drinksPerDiningCover = bevMultiplier * BASELINE_DRINKS_PER_COVER;

  // Bar-only guests drink heavier (~3 drinks/person)
  const barGuests = Math.round(covers * barGuestPct);
  // Dwell multiplier: seated guests from previous intervals still drinking
  const diningDrinks = covers * peakPct * dwellMultiplier * drinksPerDiningCover;
  const barDrinks = barGuests * peakPct * dwellMultiplier * 3.0;
  const peakDrinks = diningDrinks + barDrinks;

  const dplh = VENUE_CLASS_DPLH[venueClass || ''] || DEFAULT_DPLH;
  return Math.max(1, Math.ceil(peakDrinks / dplh));
}

/**
 * Derive per-position peak-hour CPLH from this venue's actual labor data.
 * Blends 40% venue data + 60% POS_CONFIG defaults.
 */
async function deriveVenueCPLH(
  admin: ReturnType<typeof createAdminClient>,
  venueId: string,
  positions: { id: string; name: string; category: string }[],
  employees: { id: string; primary_position_id: string }[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

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

  const validDays = laborDays.filter(
    d => d.foh_hours && d.foh_hours > 10 && d.boh_hours && d.boh_hours > 5
      && d.foh_employee_count && d.boh_employee_count,
  );
  if (validDays.length < MIN_BUSY_DAYS) return result;

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

      const estStaff = Math.max(1, Math.round(poolSize / catPool * catEmp));
      const estHours = estStaff * avgShift;
      if (estHours <= 0) continue;

      const allDayCplh = covers / estHours;
      const peakCplh = allDayCplh * avgShift * PEAK_PCT;

      if (!posStats[posName]) posStats[posName] = { totalCoversWeighted: 0, cplhSum: 0 };
      posStats[posName].totalCoversWeighted += covers;
      posStats[posName].cplhSum += peakCplh * covers;
    }
  }

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
  templates: ShiftTemplate[],
  fixed?: boolean,
): { template: ShiftTemplate; count: number }[] {
  if (peakStaff === 0 || !templates || templates.length === 0) return [];

  if (fixed) {
    return templates.map(t => ({ template: t, count: 1 }));
  }

  if (templates.length === 1) {
    return [{ template: templates[0], count: peakStaff }];
  }

  if (templates.length === 2) {
    const earlyCount = Math.max(1, Math.floor(peakStaff * 0.4));
    const lateCount  = peakStaff - earlyCount;
    const result: { template: ShiftTemplate; count: number }[] = [];
    if (earlyCount > 0) result.push({ template: templates[0], count: earlyCount });
    if (lateCount  > 0) result.push({ template: templates[1], count: lateCount });
    return result;
  }

  if (peakStaff === 1) {
    return [{ template: templates[1], count: 1 }];
  }
  if (peakStaff === 2) {
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

/**
 * Compute service quality score from actual covers-per-server ratio.
 * 1.0 = ideal ratio, degrades as servers are over- or under-allocated.
 */
function computeServiceQuality(
  totalCovers: number,
  serverShifts: number,
): number {
  if (serverShifts === 0 || totalCovers === 0) return 0;
  const idealCPS = 15; // ideal covers per server per shift
  const actualCPS = totalCovers / serverShifts;
  const ratio = actualCPS / idealCPS;
  if (ratio >= 0.8 && ratio <= 1.2) return 1.0;
  if (ratio < 0.8) return Math.max(0.3, ratio / 0.8);
  return Math.max(0.3, 1.0 - (ratio - 1.2) * 0.5);
}

// ── Main Scheduler ────────────────────────────────────────────────────────────

export async function generateScheduleTS(
  venueId: string,
  weekStart: string,
  save: boolean,
): Promise<{ scheduleId: string | null; shiftCount: number; totalHours: number; totalCost: number; unfilledPositions: Record<string, number> }> {
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

  // ── Fetch admin overrides (gracefully handle table not existing) ──────────
  let adminOverrides: AdminOverride[] = [];
  try {
    const { data: overrides } = await admin
      .from('schedule_position_overrides')
      .select('position_name, shift_start, shift_end, min_shift_hours, cplh_override, min_staff, max_staff, bar_guest_pct')
      .eq('venue_id', venueId)
      .eq('is_active', true);
    if (overrides) adminOverrides = overrides as AdminOverride[];
  } catch { /* table may not exist yet */ }
  const overrideMap = new Map(adminOverrides.map(o => [o.position_name, o]));
  if (adminOverrides.length > 0) {
    console.log('[scheduler] Active overrides:', adminOverrides.map(o =>
      `${o.position_name}: start=${o.shift_start} end=${o.shift_end} cplh=${o.cplh_override}`
    ));
  } else {
    console.log('[scheduler] No active overrides found for venue', venueId);
  }

  // ── Fetch venue hours + dwell time from location_config ────────────────────
  let venueHours: VenueHours = { open: 18, close: 2 }; // sensible default for nightlife
  let dwellMinutes = 90; // default 90-min table turn
  try {
    const { data: locConfig } = await admin
      .from('location_config')
      .select('open_hour, close_hour, default_dwell_minutes')
      .eq('venue_id', venueId)
      .single();
    if (locConfig) {
      venueHours = {
        open: locConfig.open_hour ?? 18,
        close: locConfig.close_hour ?? 2,
      };
      dwellMinutes = locConfig.default_dwell_minutes ?? 90;
    }
  } catch { /* location_config may not exist or have data */ }
  const dwellMultiplier = getDwellMultiplier(dwellMinutes);

  // ── Fetch demand distribution curves grouped by day_type ──────────────────
  const demandCurvesByDayType = new Map<string, DemandInterval[]>();
  let demandIntervalsFallback: DemandInterval[] = [];
  try {
    const { data: curves } = await admin
      .from('demand_distribution_curves')
      .select('day_type, interval_start, pct_of_daily_covers')
      .eq('venue_id', venueId)
      .order('interval_start');
    if (curves && curves.length > 0) {
      for (const c of curves as any[]) {
        const dt = c.day_type as string;
        if (!demandCurvesByDayType.has(dt)) demandCurvesByDayType.set(dt, []);
        demandCurvesByDayType.get(dt)!.push({
          interval_start: c.interval_start,
          pct_of_daily_covers: c.pct_of_daily_covers,
        });
      }
      // Fallback: use the day_type with the most intervals
      let maxLen = 0;
      for (const [, intervals] of demandCurvesByDayType) {
        if (intervals.length > maxLen) {
          maxLen = intervals.length;
          demandIntervalsFallback = intervals;
        }
      }
    }
  } catch { /* table may not exist */ }

  // Build lookup maps
  const posMap     = new Map(positions.map(p => [p.id, p]));
  const posNameMap = new Map(positions.map(p => [p.name, p]));

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
  let serverShiftCount = 0;
  const unfilledPositions = new Map<string, number>(); // positions needing staff

  // ── Per-day scheduling ────────────────────────────────────────────────────
  for (const day of weekDays) {
    const forecast = dateCoversMap[day.date] ?? null;
    if (!forecast || forecast.covers === 0) continue;

    totalCovers  += forecast.covers;
    totalRevenue += forecast.revenue;

    // ── Per-position wave assignment ──────────────────────────────────────
    for (const [posName, config] of Object.entries(POS_CONFIG)) {
      const override = overrideMap.get(posName);

      // CPLH priority: admin override > venue-derived > default
      let effectiveCplh: number | undefined;
      if (override?.cplh_override) {
        effectiveCplh = override.cplh_override;
      } else {
        effectiveCplh = venueCPLH.get(posName) || config.cplh;
      }

      // Calculate peak staff needed
      let peakStaff: number;
      if (config.useBarModel && !override?.cplh_override) {
        const bevPct = bevIntensity.get(day.dow) ?? INDUSTRY_AVG_BEV_PCT;
        const barGuestPct = override?.bar_guest_pct ?? 0;
        peakStaff = calcBarStaff(forecast.covers, bevPct, venueClass, config.peakPct, barGuestPct, dwellMultiplier);
      } else {
        peakStaff = calcPeakStaff(forecast.covers, config, effectiveCplh, dwellMultiplier);
      }

      // Apply admin min/max staff constraints
      if (override) {
        if (override.min_staff > 0) peakStaff = Math.max(peakStaff, override.min_staff);
        if (override.max_staff !== null && override.max_staff > 0) {
          peakStaff = Math.min(peakStaff, override.max_staff);
        }
      }

      if (peakStaff === 0) continue;

      const posInfo = posNameMap.get(posName);
      if (!posInfo) continue;

      const pool = empByPos.get(posName) || [];
      const hasEmployees = pool.length > 0;

      // Build shift templates: admin override > demand curves > venue hours
      let templates: ShiftTemplate[];
      if (override?.shift_start && override?.shift_end) {
        templates = buildTemplatesFromOverride(override);
        console.log(`[scheduler] ${posName} using OVERRIDE templates:`, templates.map(t => `${t.start}-${t.end}`));
      } else {
        const minShift = override?.min_shift_hours ??
          (config.category === 'front_of_house' ? FOH_MIN_SHIFT_HOURS : BOH_MIN_SHIFT_HOURS);
        // Select demand intervals for this day's day_type (weekday/friday/saturday/sunday)
        const dayType = dowToDayType(day.dow);
        const dayDemandIntervals = demandCurvesByDayType.get(dayType)
          ?? (demandIntervalsFallback.length > 0 ? demandIntervalsFallback : undefined);
        templates = buildTemplatesFromVenueHours(
          venueHours, config.category, posName, dayDemandIntervals, minShift,
        );
      }

      if (templates.length === 0) continue;

      const waves = distributeWaves(peakStaff, templates, config.fixed);

      // ── Per-wave assignment ─────────────────────────────────────────────
      for (const wave of waves) {
        if (!hasEmployees) {
          // No employees for this position — track as unfilled need
          // Managers can add shifts via "Add Shift" dialog
          if (!unfilledPositions.has(posName)) unfilledPositions.set(posName, 0);
          unfilledPositions.set(posName, (unfilledPositions.get(posName) || 0) + wave.count);
          continue;
        }

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

          // CA meal break deduction: paid hours exclude unpaid breaks
          const grossHours = wave.template.hours;
          const netHours = paidHours(grossHours);
          const shiftCost = netHours * posInfo.base_hourly_rate;

          shifts.push({
            venue_id:         venueId,
            employee_id:      emp.id,
            position_id:      posInfo.id,
            business_date:    day.date,
            shift_type:       wave.template.type,
            scheduled_start:  toTimestamp(day.date, wave.template.start),
            scheduled_end:    toTimestamp(endDate, wave.template.end),
            scheduled_hours:  netHours,
            hourly_rate:      posInfo.base_hourly_rate,
            scheduled_cost:   shiftCost,
            status:           'scheduled',
          });

          empHours.set(emp.id, currentHours + netHours);
          days.add(day.date);
          empDays.set(emp.id, days);
          totalHours += netHours;
          totalCost  += shiftCost;
          waveAssigned++;

          if (posName === 'Server') serverShiftCount++;
        }
      }
    }
  }

  // Compute service quality from actual staffing ratio (not hardcoded)
  const serviceQuality = computeServiceQuality(totalCovers, serverShiftCount);

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
        service_quality_score: Math.round(serviceQuality * 100) / 100,
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

  // Convert unfilledPositions map to plain object for JSON serialization
  const unfilled: Record<string, number> = {};
  for (const [pos, count] of unfilledPositions) {
    unfilled[pos] = count;
  }

  return { scheduleId, shiftCount: shifts.length, totalHours, totalCost, unfilledPositions: unfilled };
}
