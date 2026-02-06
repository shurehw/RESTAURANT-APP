/**
 * Forecast Accuracy Analysis
 * Compares demand_forecasts predictions to venue_day_facts actuals
 *
 * Run with: npx ts-node --project tsconfig.scripts.json scripts/analyze-forecast-accuracy.ts
 */

import { getServiceClient } from '../lib/supabase/service';

const supabase = getServiceClient();

interface AccuracyMetrics {
  venue_name: string;
  total_days: number;
  mape: number; // Mean Absolute Percentage Error
  rmse: number; // Root Mean Square Error
  mae: number;  // Mean Absolute Error
  within_10pct: number; // % of days within 10%
  within_20pct: number; // % of days within 20%
  avg_bias: number; // Positive = over-forecast, Negative = under-forecast
  covers_mape: number;
  revenue_mape: number;
}

async function analyzeForecastAccuracy() {
  console.log('🔍 Analyzing Forecast Accuracy...\n');

  // Get all forecasts with matching actuals
  const { data: forecasts, error: forecastError } = await supabase
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
    console.error('Error fetching forecasts:', forecastError);
    return;
  }

  if (!forecasts || forecasts.length === 0) {
    console.log('No forecasts found in demand_forecasts table.');
    return;
  }

  console.log(`Found ${forecasts.length} forecasts\n`);

  // Get actuals from venue_day_facts
  const venueIds = [...new Set(forecasts.map(f => f.venue_id))];
  const dates = [...new Set(forecasts.map(f => f.business_date))];

  const { data: actuals, error: actualsError } = await supabase
    .from('venue_day_facts')
    .select('venue_id, business_date, net_sales, covers_count')
    .in('venue_id', venueIds)
    .in('business_date', dates);

  if (actualsError) {
    console.error('Error fetching actuals:', actualsError);
    return;
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
    errors: number[];
    covers_errors: number[];
    revenue_errors: number[];
    pct_errors: number[];
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
        errors: [],
        covers_errors: [],
        revenue_errors: [],
        pct_errors: [],
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

    // Revenue error (if we have both)
    if (forecast.revenue_predicted && actual.revenue > 0) {
      const revenuePredicted = forecast.revenue_predicted;
      const revenueActual = actual.revenue;
      const revenueError = revenuePredicted - revenueActual;
      const revenuePctError = Math.abs(revenueError / revenueActual) * 100;

      metrics.revenue_errors.push(revenueError);
      metrics.revenue_pct_errors.push(revenuePctError);
    }

    // Combined error (using covers as primary)
    metrics.errors.push(coversError);
    metrics.pct_errors.push(coversPctError);
  }

  console.log(`Matched: ${matchedCount} forecasts with actuals`);
  console.log(`Unmatched: ${unmatchedCount} forecasts (no actual data)\n`);

  if (matchedCount === 0) {
    console.log('No matched forecast/actual pairs found.');
    return;
  }

  // Calculate and display metrics by venue
  console.log('=' .repeat(80));
  console.log('FORECAST ACCURACY BY VENUE');
  console.log('=' .repeat(80));

  const allMetrics: AccuracyMetrics[] = [];

  for (const [venueId, data] of venueMetrics) {
    const n = data.pct_errors.length;
    if (n === 0) continue;

    // MAPE (Mean Absolute Percentage Error)
    const mape = data.pct_errors.reduce((a, b) => a + b, 0) / n;
    const coversMape = data.covers_pct_errors.reduce((a, b) => a + b, 0) / n;
    const revenueMape = data.revenue_pct_errors.length > 0
      ? data.revenue_pct_errors.reduce((a, b) => a + b, 0) / data.revenue_pct_errors.length
      : 0;

    // MAE (Mean Absolute Error)
    const mae = data.covers_errors.reduce((a, b) => a + Math.abs(b), 0) / n;

    // RMSE (Root Mean Square Error)
    const rmse = Math.sqrt(
      data.covers_errors.reduce((a, b) => a + b * b, 0) / n
    );

    // Bias (average error - positive means over-forecasting)
    const avgBias = data.covers_errors.reduce((a, b) => a + b, 0) / n;

    // Within thresholds
    const within10 = (data.pct_errors.filter(e => e <= 10).length / n) * 100;
    const within20 = (data.pct_errors.filter(e => e <= 20).length / n) * 100;

    const metrics: AccuracyMetrics = {
      venue_name: data.venue_name,
      total_days: n,
      mape: Math.round(mape * 10) / 10,
      rmse: Math.round(rmse * 10) / 10,
      mae: Math.round(mae * 10) / 10,
      within_10pct: Math.round(within10),
      within_20pct: Math.round(within20),
      avg_bias: Math.round(avgBias * 10) / 10,
      covers_mape: Math.round(coversMape * 10) / 10,
      revenue_mape: Math.round(revenueMape * 10) / 10,
    };

    allMetrics.push(metrics);

    console.log(`\n📍 ${data.venue_name}`);
    console.log(`   Days analyzed: ${n}`);
    console.log(`   Covers MAPE: ${metrics.covers_mape}%`);
    console.log(`   Revenue MAPE: ${metrics.revenue_mape}%`);
    console.log(`   MAE (covers): ${metrics.mae}`);
    console.log(`   RMSE (covers): ${metrics.rmse}`);
    console.log(`   Avg Bias: ${metrics.avg_bias > 0 ? '+' : ''}${metrics.avg_bias} covers`);
    console.log(`   Within 10%: ${metrics.within_10pct}%`);
    console.log(`   Within 20%: ${metrics.within_20pct}%`);
  }

  // Overall summary
  if (allMetrics.length > 0) {
    const totalDays = allMetrics.reduce((a, b) => a + b.total_days, 0);
    const avgMape = allMetrics.reduce((a, b) => a + b.mape * b.total_days, 0) / totalDays;
    const avgWithin10 = allMetrics.reduce((a, b) => a + b.within_10pct * b.total_days, 0) / totalDays;
    const avgWithin20 = allMetrics.reduce((a, b) => a + b.within_20pct * b.total_days, 0) / totalDays;

    console.log('\n' + '=' .repeat(80));
    console.log('OVERALL SUMMARY');
    console.log('=' .repeat(80));
    console.log(`Total forecast days analyzed: ${totalDays}`);
    console.log(`Average MAPE: ${Math.round(avgMape * 10) / 10}%`);
    console.log(`Average within 10%: ${Math.round(avgWithin10)}%`);
    console.log(`Average within 20%: ${Math.round(avgWithin20)}%`);

    // Interpretation
    console.log('\n📊 INTERPRETATION:');
    if (avgMape < 10) {
      console.log('   ✅ Excellent accuracy (MAPE < 10%)');
    } else if (avgMape < 15) {
      console.log('   ✅ Good accuracy (MAPE 10-15%)');
    } else if (avgMape < 20) {
      console.log('   ⚠️  Moderate accuracy (MAPE 15-20%) - consider tuning');
    } else {
      console.log('   ❌ Poor accuracy (MAPE > 20%) - model needs improvement');
    }
  }
}

analyzeForecastAccuracy().catch(console.error);
