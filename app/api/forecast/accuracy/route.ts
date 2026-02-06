/**
 * Forecast Accuracy Analysis API
 * GET /api/forecast/accuracy
 *
 * Compares demand_forecasts predictions to venue_day_facts actuals
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

interface AccuracyMetrics {
  venue_id: string;
  venue_name: string;
  total_days: number;
  covers_mape: number;
  revenue_mape: number;
  mae: number;
  rmse: number;
  avg_bias: number;
  within_10pct: number;
  within_20pct: number;
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
        shift_type,
        covers_predicted,
        covers_lower,
        covers_upper,
        revenue_predicted,
        model_version,
        venues!inner(name)
      `)
      .order('business_date', { ascending: false });

    if (forecastError) {
      return NextResponse.json({ error: forecastError.message }, { status: 500 });
    }

    if (!forecasts || forecasts.length === 0) {
      return NextResponse.json({
        message: 'No forecasts found in demand_forecasts table',
        metrics: [],
        summary: null,
      });
    }

    // Get actuals from venue_day_facts
    const venueIds = [...new Set(forecasts.map((f: any) => f.venue_id))];
    const dates = [...new Set(forecasts.map((f: any) => f.business_date))];

    const { data: actuals, error: actualsError } = await (supabase as any)
      .from('venue_day_facts')
      .select('venue_id, business_date, net_sales, covers_count')
      .in('venue_id', venueIds)
      .in('business_date', dates);

    if (actualsError) {
      return NextResponse.json({ error: actualsError.message }, { status: 500 });
    }

    // Create lookup map for actuals
    const actualsMap = new Map<string, { covers: number; revenue: number }>();
    for (const actual of actuals || []) {
      const key = `${actual.venue_id}|${actual.business_date}`;
      actualsMap.set(key, {
        covers: actual.covers_count || 0,
        revenue: actual.net_sales || 0,
      });
    }

    // Calculate accuracy by venue
    const venueMetrics = new Map<string, {
      venue_name: string;
      covers_errors: number[];
      revenue_errors: number[];
      covers_pct_errors: number[];
      revenue_pct_errors: number[];
    }>();

    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const forecast of forecasts) {
      const key = `${forecast.venue_id}|${forecast.business_date}`;
      const actual = actualsMap.get(key);

      if (!actual || actual.covers === 0) {
        unmatchedCount++;
        continue;
      }

      matchedCount++;
      const venueName = (forecast.venues as any)?.name || 'Unknown';

      if (!venueMetrics.has(forecast.venue_id)) {
        venueMetrics.set(forecast.venue_id, {
          venue_name: venueName,
          covers_errors: [],
          revenue_errors: [],
          covers_pct_errors: [],
          revenue_pct_errors: [],
        });
      }

      const metrics = venueMetrics.get(forecast.venue_id)!;

      // Covers error
      const coversPredicted = forecast.covers_predicted || 0;
      const coversActual = actual.covers;
      const coversError = coversPredicted - coversActual;
      const coversPctError = coversActual > 0
        ? Math.abs(coversError / coversActual) * 100
        : 0;

      metrics.covers_errors.push(coversError);
      metrics.covers_pct_errors.push(coversPctError);

      // Revenue error
      if (forecast.revenue_predicted && actual.revenue > 0) {
        const revenuePredicted = forecast.revenue_predicted;
        const revenueActual = actual.revenue;
        const revenueError = revenuePredicted - revenueActual;
        const revenuePctError = Math.abs(revenueError / revenueActual) * 100;

        metrics.revenue_errors.push(revenueError);
        metrics.revenue_pct_errors.push(revenuePctError);
      }
    }

    // Calculate final metrics by venue
    const allMetrics: AccuracyMetrics[] = [];

    for (const [venueId, data] of venueMetrics) {
      const n = data.covers_pct_errors.length;
      if (n === 0) continue;

      // MAPE
      const coversMape = data.covers_pct_errors.reduce((a, b) => a + b, 0) / n;
      const revenueMape = data.revenue_pct_errors.length > 0
        ? data.revenue_pct_errors.reduce((a, b) => a + b, 0) / data.revenue_pct_errors.length
        : 0;

      // MAE
      const mae = data.covers_errors.reduce((a, b) => a + Math.abs(b), 0) / n;

      // RMSE
      const rmse = Math.sqrt(data.covers_errors.reduce((a, b) => a + b * b, 0) / n);

      // Bias
      const avgBias = data.covers_errors.reduce((a, b) => a + b, 0) / n;

      // Within thresholds
      const within10 = (data.covers_pct_errors.filter(e => e <= 10).length / n) * 100;
      const within20 = (data.covers_pct_errors.filter(e => e <= 20).length / n) * 100;

      allMetrics.push({
        venue_id: venueId,
        venue_name: data.venue_name,
        total_days: n,
        covers_mape: Math.round(coversMape * 10) / 10,
        revenue_mape: Math.round(revenueMape * 10) / 10,
        mae: Math.round(mae * 10) / 10,
        rmse: Math.round(rmse * 10) / 10,
        avg_bias: Math.round(avgBias * 10) / 10,
        within_10pct: Math.round(within10),
        within_20pct: Math.round(within20),
      });
    }

    // Overall summary
    let summary = null;
    if (allMetrics.length > 0) {
      const totalDays = allMetrics.reduce((a, b) => a + b.total_days, 0);
      const avgMape = allMetrics.reduce((a, b) => a + b.covers_mape * b.total_days, 0) / totalDays;
      const avgWithin10 = allMetrics.reduce((a, b) => a + b.within_10pct * b.total_days, 0) / totalDays;
      const avgWithin20 = allMetrics.reduce((a, b) => a + b.within_20pct * b.total_days, 0) / totalDays;

      let rating: string;
      if (avgMape < 10) rating = 'Excellent (MAPE < 10%)';
      else if (avgMape < 15) rating = 'Good (MAPE 10-15%)';
      else if (avgMape < 20) rating = 'Moderate (MAPE 15-20%) - consider tuning';
      else rating = 'Poor (MAPE > 20%) - model needs improvement';

      summary = {
        total_forecasts: forecasts.length,
        matched_with_actuals: matchedCount,
        unmatched: unmatchedCount,
        total_days_analyzed: totalDays,
        avg_mape: Math.round(avgMape * 10) / 10,
        avg_within_10pct: Math.round(avgWithin10),
        avg_within_20pct: Math.round(avgWithin20),
        rating,
      };
    }

    return NextResponse.json({
      metrics: allMetrics,
      summary,
    });
  } catch (error: any) {
    console.error('Forecast accuracy error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
