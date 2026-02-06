/**
 * Forecast Bias Analysis by Day Type
 * GET /api/forecast/accuracy/by-day-type
 *
 * Computes bias (actual - predicted) grouped by venue and day_type
 * This data is used to calibrate day_type_offsets in forecast_bias_adjustments
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

type DayType = 'weekday' | 'friday' | 'saturday' | 'sunday' | 'holiday';

interface DayTypeBias {
  day_type: DayType;
  count: number;
  avg_bias: number;        // actual - predicted (positive = under-predicting)
  avg_actual: number;
  avg_predicted: number;
  mape: number;
  within_10pct: number;
  within_20pct: number;
  // Simulated correction
  simulated_mape?: number;
  simulated_within_10pct?: number;
}

interface VenueDayTypeBias {
  venue_id: string;
  venue_name: string;
  total_days: number;
  overall_bias: number;
  by_day_type: DayTypeBias[];
  recommended_offsets: Record<DayType, number>;
}

// Compute day type from date string
function getDayType(dateStr: string): DayType {
  const date = new Date(dateStr + 'T12:00:00Z'); // Use noon to avoid timezone issues
  const dow = date.getUTCDay();

  // US Holidays (simplified - matches migration)
  const holidays = [
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-07-04',
    '2025-09-01', '2025-11-27', '2025-11-28', '2025-12-25', '2025-12-31',
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-04',
    '2026-09-07', '2026-11-26', '2026-11-27', '2026-12-25', '2026-12-31',
  ];

  if (holidays.includes(dateStr)) return 'holiday';

  switch (dow) {
    case 0: return 'sunday';
    case 5: return 'friday';
    case 6: return 'saturday';
    default: return 'weekday';
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceClient();

    // Get all forecasts
    const { data: forecasts, error: forecastError } = await (supabase as any)
      .from('demand_forecasts')
      .select(`
        id,
        venue_id,
        business_date,
        covers_predicted,
        venues!inner(name)
      `)
      .order('business_date', { ascending: false });

    if (forecastError) {
      return NextResponse.json({ error: forecastError.message }, { status: 500 });
    }

    if (!forecasts || forecasts.length === 0) {
      return NextResponse.json({
        message: 'No forecasts found',
        venues: [],
      });
    }

    // Get actuals
    const venueIds = [...new Set(forecasts.map((f: any) => f.venue_id))];
    const dates = [...new Set(forecasts.map((f: any) => f.business_date))];

    const { data: actuals, error: actualsError } = await (supabase as any)
      .from('venue_day_facts')
      .select('venue_id, business_date, covers_count')
      .in('venue_id', venueIds)
      .in('business_date', dates);

    if (actualsError) {
      return NextResponse.json({ error: actualsError.message }, { status: 500 });
    }

    // Create lookup map for actuals
    const actualsMap = new Map<string, number>();
    for (const actual of actuals || []) {
      const key = `${actual.venue_id}|${actual.business_date}`;
      actualsMap.set(key, actual.covers_count || 0);
    }

    // Group by venue and day_type
    const venueData = new Map<string, {
      venue_name: string;
      by_day_type: Map<DayType, {
        predicted: number[];
        actual: number[];
        errors: number[];      // predicted - actual
        biases: number[];      // actual - predicted (for offset calculation)
        pct_errors: number[];
      }>;
    }>();

    for (const forecast of forecasts) {
      const key = `${forecast.venue_id}|${forecast.business_date}`;
      const actualCovers = actualsMap.get(key);

      if (actualCovers === undefined || actualCovers === 0) continue;

      const venueName = (forecast.venues as any)?.name || 'Unknown';
      const dayType = getDayType(forecast.business_date);
      const predicted = forecast.covers_predicted || 0;

      if (!venueData.has(forecast.venue_id)) {
        venueData.set(forecast.venue_id, {
          venue_name: venueName,
          by_day_type: new Map(),
        });
      }

      const venue = venueData.get(forecast.venue_id)!;
      if (!venue.by_day_type.has(dayType)) {
        venue.by_day_type.set(dayType, {
          predicted: [],
          actual: [],
          errors: [],
          biases: [],
          pct_errors: [],
        });
      }

      const dt = venue.by_day_type.get(dayType)!;
      const error = predicted - actualCovers;
      const bias = actualCovers - predicted; // Positive = under-predicting
      const pctError = Math.abs(error / actualCovers) * 100;

      dt.predicted.push(predicted);
      dt.actual.push(actualCovers);
      dt.errors.push(error);
      dt.biases.push(bias);
      dt.pct_errors.push(pctError);
    }

    // Calculate metrics for each venue
    const results: VenueDayTypeBias[] = [];
    const dayTypes: DayType[] = ['weekday', 'friday', 'saturday', 'sunday', 'holiday'];

    for (const [venueId, venue] of venueData) {
      const byDayType: DayTypeBias[] = [];
      const recommendedOffsets: Record<DayType, number> = {
        weekday: 0,
        friday: 0,
        saturday: 0,
        sunday: 0,
        holiday: 0,
      };

      let totalDays = 0;
      let totalBias = 0;
      let totalCount = 0;

      for (const dayType of dayTypes) {
        const dt = venue.by_day_type.get(dayType);
        if (!dt || dt.biases.length === 0) continue;

        const n = dt.biases.length;
        totalDays += n;

        const avgBias = dt.biases.reduce((a, b) => a + b, 0) / n;
        const avgActual = dt.actual.reduce((a, b) => a + b, 0) / n;
        const avgPredicted = dt.predicted.reduce((a, b) => a + b, 0) / n;
        const mape = dt.pct_errors.reduce((a, b) => a + b, 0) / n;
        const within10 = (dt.pct_errors.filter(e => e <= 10).length / n) * 100;
        const within20 = (dt.pct_errors.filter(e => e <= 20).length / n) * 100;

        totalBias += avgBias * n;
        totalCount += n;

        // Simulate what MAPE would be with this offset applied
        const offset = Math.round(avgBias);
        const simulatedPctErrors = dt.actual.map((actual, i) => {
          const correctedPred = dt.predicted[i] + offset;
          return Math.abs((correctedPred - actual) / actual) * 100;
        });
        const simulatedMape = simulatedPctErrors.reduce((a, b) => a + b, 0) / n;
        const simulatedWithin10 = (simulatedPctErrors.filter(e => e <= 10).length / n) * 100;

        recommendedOffsets[dayType] = offset;

        byDayType.push({
          day_type: dayType,
          count: n,
          avg_bias: Math.round(avgBias * 10) / 10,
          avg_actual: Math.round(avgActual),
          avg_predicted: Math.round(avgPredicted),
          mape: Math.round(mape * 10) / 10,
          within_10pct: Math.round(within10),
          within_20pct: Math.round(within20),
          simulated_mape: Math.round(simulatedMape * 10) / 10,
          simulated_within_10pct: Math.round(simulatedWithin10),
        });
      }

      results.push({
        venue_id: venueId,
        venue_name: venue.venue_name,
        total_days: totalDays,
        overall_bias: totalCount > 0 ? Math.round((totalBias / totalCount) * 10) / 10 : 0,
        by_day_type: byDayType,
        recommended_offsets: recommendedOffsets,
      });
    }

    // Sort by venue name
    results.sort((a, b) => a.venue_name.localeCompare(b.venue_name));

    // Generate SQL for updating bias adjustments
    const sqlStatements = results.map(v => {
      const offsets = JSON.stringify(v.recommended_offsets);
      return `UPDATE forecast_bias_adjustments SET day_type_offsets = '${offsets}'::jsonb, covers_offset = 0 WHERE venue_id = '${v.venue_id}';`;
    });

    return NextResponse.json({
      venues: results,
      sql_updates: sqlStatements,
      summary: {
        total_venues: results.length,
        total_days_analyzed: results.reduce((a, b) => a + b.total_days, 0),
      },
    });
  } catch (error: any) {
    console.error('Day-type bias analysis error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
