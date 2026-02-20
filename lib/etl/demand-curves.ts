/**
 * Demand Distribution Curves ETL
 *
 * Computes 30-minute interval demand distributions from TipSee check-level
 * data. These curves break daily forecasts into interval-level predictions.
 *
 * Flow:
 *   1. Query TipSee tipsee_checks.open_time for last N days
 *   2. Bucket into 30-min intervals in venue local timezone
 *   3. Compute avg covers/revenue per interval per day_type
 *   4. Normalize to percentages of daily total
 *   5. Upsert into demand_distribution_curves (Supabase)
 */

import { getTipseePool } from '@/lib/database/tipsee';
import { getServiceClient } from '@/lib/supabase/service';
import { getVenueTipseeMappings } from '@/lib/etl/tipsee-sync';
import { getVenueTimezone } from '@/lib/database/sales-pace';

// ============================================================================
// Types
// ============================================================================

interface IntervalBucket {
  trading_day: string;
  interval_start: string; // TIME string, e.g., '17:00:00'
  checks: number;
  covers: number;
  revenue: number;
}

interface CurveRow {
  venue_id: string;
  day_type: string;
  interval_start: string;
  pct_of_daily_covers: number;
  pct_of_daily_revenue: number;
  avg_covers: number;
  avg_revenue: number;
  avg_checks: number;
  sample_size: number;
  stddev_covers: number;
  lookback_days: number;
}

export interface CurveComputeResult {
  venue_id: string;
  venue_name: string;
  curves_upserted: number;
  day_types_computed: string[];
  error?: string;
}

// ============================================================================
// Day type classification (mirrors SQL get_day_type and Python get_day_type)
// ============================================================================

const US_HOLIDAYS = new Set([
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-07-04',
  '2025-09-01', '2025-11-27', '2025-11-28', '2025-12-25', '2025-12-31',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-04',
  '2026-09-07', '2026-11-26', '2026-11-27', '2026-12-25', '2026-12-31',
]);

function getDayType(dateStr: string): string {
  if (US_HOLIDAYS.has(dateStr)) return 'holiday';
  const d = new Date(dateStr + 'T12:00:00'); // noon to avoid TZ issues
  const dow = d.getDay(); // 0=Sun, 6=Sat
  if (dow === 0) return 'sunday';
  if (dow === 5) return 'friday';
  if (dow === 6) return 'saturday';
  return 'weekday';
}

// ============================================================================
// Core: Compute distribution curves for a single venue
// ============================================================================

export async function computeDistributionCurves(
  venueId: string,
  tipseeLocationUuid: string,
  timezone: string,
  lookbackDays: number = 730
): Promise<{ curves_upserted: number; day_types_computed: string[] }> {
  const pool = getTipseePool();
  const supabase = getServiceClient();

  // 1. Query TipSee for check-level data bucketed into 30-min intervals
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - lookbackDays * 86400000).toISOString().split('T')[0];

  const result = await pool.query<IntervalBucket>(
    `SELECT
      trading_day::text as trading_day,
      (DATE_TRUNC('hour', open_time AT TIME ZONE $2)
        + INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM open_time AT TIME ZONE $2) / 30)
      )::time::text as interval_start,
      COUNT(*)::integer as checks,
      SUM(guest_count)::integer as covers,
      SUM(revenue_total)::numeric as revenue
    FROM public.tipsee_checks
    WHERE location_uuid = $1
      AND trading_day >= $3::date
      AND trading_day <= $4::date
      AND guest_count > 0
    GROUP BY trading_day, interval_start
    ORDER BY trading_day, interval_start`,
    [tipseeLocationUuid, timezone, startDate, endDate]
  );

  if (result.rows.length === 0) {
    return { curves_upserted: 0, day_types_computed: [] };
  }

  // 2. Group by (day_type, interval_start) and accumulate per-day stats
  // Structure: dayType → intervalStart → { daily totals per trading_day }
  const byDayType = new Map<string, Map<string, {
    coversByDay: number[];
    revenueByDay: number[];
    checksByDay: number[];
    tradingDays: Set<string>;
  }>>();

  for (const row of result.rows) {
    const dayType = getDayType(row.trading_day);
    if (!byDayType.has(dayType)) byDayType.set(dayType, new Map());
    const intervals = byDayType.get(dayType)!;

    if (!intervals.has(row.interval_start)) {
      intervals.set(row.interval_start, {
        coversByDay: [],
        revenueByDay: [],
        checksByDay: [],
        tradingDays: new Set(),
      });
    }
    const bucket = intervals.get(row.interval_start)!;
    bucket.coversByDay.push(Number(row.covers));
    bucket.revenueByDay.push(Number(row.revenue));
    bucket.checksByDay.push(Number(row.checks));
    bucket.tradingDays.add(row.trading_day);
  }

  // 3. Compute averages and normalize to percentages per day_type
  const curveRows: CurveRow[] = [];
  const dayTypesComputed: string[] = [];

  for (const [dayType, intervals] of byDayType) {
    // Count distinct trading days for this day_type
    const allDays = new Set<string>();
    for (const bucket of intervals.values()) {
      for (const d of bucket.tradingDays) allDays.add(d);
    }

    // Need at least 3 sample days to produce a reliable curve
    if (allDays.size < 3) continue;

    // Compute averages per interval
    const intervalAvgs: Array<{
      interval_start: string;
      avgCovers: number;
      avgRevenue: number;
      avgChecks: number;
      sampleSize: number;
      stddevCovers: number;
    }> = [];

    let totalAvgCovers = 0;
    let totalAvgRevenue = 0;

    for (const [intervalStart, bucket] of intervals) {
      // Skip intervals with fewer than 3 sample days — noise from test checks
      if (bucket.tradingDays.size < 3) continue;

      const n = bucket.coversByDay.length;
      const avgCovers = bucket.coversByDay.reduce((a, b) => a + b, 0) / n;
      const avgRevenue = bucket.revenueByDay.reduce((a, b) => a + b, 0) / n;
      const avgChecks = bucket.checksByDay.reduce((a, b) => a + b, 0) / n;

      // Standard deviation of covers
      const mean = avgCovers;
      const variance = bucket.coversByDay.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
      const stddev = Math.sqrt(variance);

      intervalAvgs.push({
        interval_start: intervalStart,
        avgCovers,
        avgRevenue,
        avgChecks,
        sampleSize: bucket.tradingDays.size,
        stddevCovers: stddev,
      });

      totalAvgCovers += avgCovers;
      totalAvgRevenue += avgRevenue;
    }

    // Normalize to percentages
    for (const ia of intervalAvgs) {
      curveRows.push({
        venue_id: venueId,
        day_type: dayType,
        interval_start: ia.interval_start,
        pct_of_daily_covers: totalAvgCovers > 0
          ? Math.round((ia.avgCovers / totalAvgCovers) * 100000) / 100000
          : 0,
        pct_of_daily_revenue: totalAvgRevenue > 0
          ? Math.round((ia.avgRevenue / totalAvgRevenue) * 100000) / 100000
          : 0,
        avg_covers: Math.round(ia.avgCovers * 100) / 100,
        avg_revenue: Math.round(ia.avgRevenue * 100) / 100,
        avg_checks: Math.round(ia.avgChecks * 100) / 100,
        sample_size: ia.sampleSize,
        stddev_covers: Math.round(ia.stddevCovers * 100) / 100,
        lookback_days: lookbackDays,
      });
    }

    dayTypesComputed.push(dayType);
  }

  if (curveRows.length === 0) {
    return { curves_upserted: 0, day_types_computed: [] };
  }

  // 4. Upsert into Supabase
  const { error } = await (supabase as any)
    .from('demand_distribution_curves')
    .upsert(
      curveRows.map(r => ({
        venue_id: r.venue_id,
        day_type: r.day_type,
        interval_start: r.interval_start,
        pct_of_daily_covers: r.pct_of_daily_covers,
        pct_of_daily_revenue: r.pct_of_daily_revenue,
        avg_covers: r.avg_covers,
        avg_revenue: r.avg_revenue,
        avg_checks: r.avg_checks,
        sample_size: r.sample_size,
        stddev_covers: r.stddev_covers,
        lookback_days: r.lookback_days,
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'venue_id,day_type,interval_start' }
    );

  if (error) {
    throw new Error(`Failed to upsert curves for venue ${venueId}: ${error.message}`);
  }

  return { curves_upserted: curveRows.length, day_types_computed: dayTypesComputed };
}

// ============================================================================
// Batch: Compute curves for all active venues
// ============================================================================

export async function computeAllVenueCurves(
  lookbackDays: number = 730
): Promise<CurveComputeResult[]> {
  const pool = getTipseePool();
  const mappings = await getVenueTipseeMappings();

  if (mappings.length === 0) {
    console.warn('[demand-curves] No venue-TipSee mappings found');
    return [];
  }

  // Detect POS type for each mapping — skip Simphony (no open_time data)
  const upserveMappings: typeof mappings = [];
  for (const m of mappings) {
    try {
      const res = await pool.query(
        `SELECT pos_type FROM public.general_locations WHERE uuid = $1 LIMIT 1`,
        [m.tipsee_location_uuid]
      );
      const posType = res.rows[0]?.pos_type;
      if (posType === 'simphony') {
        console.log(`[demand-curves] Skipping ${m.venue_name} (Simphony — no check timestamps)`);
        continue;
      }
    } catch {
      // If we can't detect POS type, assume Upserve and try
    }
    upserveMappings.push(m);
  }

  // Process each venue
  const results = await Promise.allSettled(
    upserveMappings.map(async (m): Promise<CurveComputeResult> => {
      const tz = await getVenueTimezone(m.venue_id);
      const res = await computeDistributionCurves(
        m.venue_id,
        m.tipsee_location_uuid,
        tz,
        lookbackDays
      );
      return {
        venue_id: m.venue_id,
        venue_name: m.venue_name,
        curves_upserted: res.curves_upserted,
        day_types_computed: res.day_types_computed,
      };
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      venue_id: upserveMappings[i].venue_id,
      venue_name: upserveMappings[i].venue_name,
      curves_upserted: 0,
      day_types_computed: [],
      error: r.reason?.message || 'Unknown error',
    };
  });
}
