/**
 * Forecast Accuracy by Specific Holiday
 * GET /api/forecast/accuracy/by-holiday
 *
 * Analyzes forecast accuracy for each specific holiday to determine
 * if holiday-specific offsets are needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

// Holiday definitions with names
const HOLIDAYS: Record<string, string> = {
  // 2025
  '2025-01-01': 'New Years Day 2025',
  '2025-01-20': 'MLK Day 2025',
  '2025-02-17': 'Presidents Day 2025',
  '2025-05-26': 'Memorial Day 2025',
  '2025-07-04': 'July 4th 2025',
  '2025-09-01': 'Labor Day 2025',
  '2025-11-27': 'Thanksgiving 2025',
  '2025-11-28': 'Black Friday 2025',
  '2025-12-25': 'Christmas 2025',
  '2025-12-31': 'New Years Eve 2025',
  // 2026
  '2026-01-01': 'New Years Day 2026',
  '2026-01-19': 'MLK Day 2026',
  '2026-02-16': 'Presidents Day 2026',
  '2026-05-25': 'Memorial Day 2026',
  '2026-07-04': 'July 4th 2026',
  '2026-09-07': 'Labor Day 2026',
  '2026-11-26': 'Thanksgiving 2026',
  '2026-11-27': 'Black Friday 2026',
  '2026-12-25': 'Christmas 2026',
  '2026-12-31': 'New Years Eve 2026',
};

interface HolidayAccuracy {
  date: string;
  holiday_name: string;
  venue_id: string;
  venue_name: string;
  predicted: number;
  actual: number;
  error: number;       // predicted - actual
  bias: number;        // actual - predicted (what offset would fix it)
  pct_error: number;
}

interface HolidaySummary {
  holiday_name: string;
  total_venues: number;
  avg_bias: number;
  avg_pct_error: number;
  recommended_offset: number;
  venues: Array<{
    venue_name: string;
    bias: number;
    pct_error: number;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceClient();

    // Get all forecasts for holiday dates
    const holidayDates = Object.keys(HOLIDAYS);

    const { data: forecasts, error: forecastError } = await (supabase as any)
      .from('demand_forecasts')
      .select(`
        venue_id,
        business_date,
        covers_predicted,
        venues!inner(name)
      `)
      .in('business_date', holidayDates);

    if (forecastError) {
      return NextResponse.json({ error: forecastError.message }, { status: 500 });
    }

    if (!forecasts || forecasts.length === 0) {
      return NextResponse.json({
        message: 'No holiday forecasts found',
        holidays: [],
        by_venue: [],
      });
    }

    // Get actuals for same dates
    const { data: actuals, error: actualsError } = await (supabase as any)
      .from('venue_day_facts')
      .select('venue_id, business_date, covers_count')
      .in('business_date', holidayDates);

    if (actualsError) {
      return NextResponse.json({ error: actualsError.message }, { status: 500 });
    }

    // Create lookup map for actuals
    const actualsMap = new Map<string, number>();
    for (const actual of actuals || []) {
      const key = `${actual.venue_id}|${actual.business_date}`;
      actualsMap.set(key, actual.covers_count || 0);
    }

    // Calculate accuracy for each holiday forecast
    const holidayAccuracy: HolidayAccuracy[] = [];

    for (const forecast of forecasts) {
      const key = `${forecast.venue_id}|${forecast.business_date}`;
      const actualCovers = actualsMap.get(key);

      if (actualCovers === undefined || actualCovers === 0) continue;

      const predicted = forecast.covers_predicted || 0;
      const error = predicted - actualCovers;
      const bias = actualCovers - predicted;
      const pctError = Math.abs(error / actualCovers) * 100;

      holidayAccuracy.push({
        date: forecast.business_date,
        holiday_name: HOLIDAYS[forecast.business_date] || 'Unknown',
        venue_id: forecast.venue_id,
        venue_name: (forecast.venues as any)?.name || 'Unknown',
        predicted,
        actual: actualCovers,
        error,
        bias,
        pct_error: Math.round(pctError * 10) / 10,
      });
    }

    // Group by holiday
    const holidayGroups = new Map<string, HolidayAccuracy[]>();
    for (const acc of holidayAccuracy) {
      const key = acc.holiday_name;
      if (!holidayGroups.has(key)) {
        holidayGroups.set(key, []);
      }
      holidayGroups.get(key)!.push(acc);
    }

    // Calculate summary by holiday
    const holidaySummaries: HolidaySummary[] = [];
    for (const [holidayName, accs] of holidayGroups) {
      const avgBias = accs.reduce((sum, a) => sum + a.bias, 0) / accs.length;
      const avgPctError = accs.reduce((sum, a) => sum + a.pct_error, 0) / accs.length;

      holidaySummaries.push({
        holiday_name: holidayName,
        total_venues: accs.length,
        avg_bias: Math.round(avgBias),
        avg_pct_error: Math.round(avgPctError * 10) / 10,
        recommended_offset: Math.round(avgBias),
        venues: accs.map(a => ({
          venue_name: a.venue_name,
          bias: a.bias,
          pct_error: a.pct_error,
        })),
      });
    }

    // Sort by date (extract year from holiday name)
    holidaySummaries.sort((a, b) => a.holiday_name.localeCompare(b.holiday_name));

    // Group by venue for venue-specific holiday patterns
    const venueGroups = new Map<string, HolidayAccuracy[]>();
    for (const acc of holidayAccuracy) {
      if (!venueGroups.has(acc.venue_id)) {
        venueGroups.set(acc.venue_id, []);
      }
      venueGroups.get(acc.venue_id)!.push(acc);
    }

    const byVenue = Array.from(venueGroups.entries()).map(([venueId, accs]) => ({
      venue_id: venueId,
      venue_name: accs[0]?.venue_name || 'Unknown',
      holiday_count: accs.length,
      avg_bias: Math.round(accs.reduce((sum, a) => sum + a.bias, 0) / accs.length),
      avg_pct_error: Math.round(accs.reduce((sum, a) => sum + a.pct_error, 0) / accs.length * 10) / 10,
      holidays: accs.map(a => ({
        date: a.date,
        name: a.holiday_name,
        predicted: a.predicted,
        actual: a.actual,
        bias: a.bias,
        pct_error: a.pct_error,
      })),
    }));

    return NextResponse.json({
      total_holiday_forecasts: holidayAccuracy.length,
      holidays: holidaySummaries,
      by_venue: byVenue,
      raw_data: holidayAccuracy,
    });
  } catch (error: any) {
    console.error('Holiday accuracy error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
