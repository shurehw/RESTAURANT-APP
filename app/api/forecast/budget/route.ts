import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const budgetQuerySchema = z.object({
  venueId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  productionLevel: z.enum(['low', 'medium', 'high']).optional().default('medium'),
});

/**
 * Entertainment spend caps by production level (% of forecast)
 * Based on historical H.wood Group benchmarks
 */
const ENTERTAINMENT_CAPS = {
  low: { min: 0.01, max: 0.025 },      // DJ only: 1-2.5%
  medium: { min: 0.025, max: 0.045 },  // Band or DJ+elements: 2.5-4.5%
  high: { min: 0.045, max: 0.07 },     // Full production: 4.5-7%
} as const;

/**
 * Hard fail-safe caps (never exceed % of yhat_lower)
 */
const FAILSAFE_CAPS = {
  low: 0.03,    // 3% of conservative forecast
  medium: 0.05, // 5% of conservative forecast
  high: 0.08,   // 8% of conservative forecast
} as const;

/**
 * GET /api/forecast/budget
 * Get entertainment budget recommendation based on forecast
 *
 * Uses forecast confidence bands to determine budget basis:
 * - Low uncertainty (≤20%): use yhat (point estimate)
 * - Medium uncertainty (20-35%): use 90% of yhat
 * - High uncertainty (>35%): use yhat_lower (conservative)
 *
 * Query params:
 *   venueId: required - venue UUID
 *   date: required - YYYY-MM-DD business date
 *   productionLevel: optional - 'low' | 'medium' | 'high' (default: medium)
 */
export async function GET(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':forecast-budget');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const params = budgetQuerySchema.parse(searchParams);

    assertVenueAccess(params.venueId, venueIds);

    const supabase = await createClient();

    // Get forecast for the date
    const { data: forecasts, error } = await supabase
      .from('venue_day_forecast')
      .select('*')
      .eq('venue_id', params.venueId)
      .eq('business_date', params.date)
      .eq('forecast_type', 'net_sales')
      .order('generated_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!forecasts || forecasts.length === 0) {
      return NextResponse.json({
        venueId: params.venueId,
        date: params.date,
        hasForecast: false,
        message: 'No forecast available for this date',
        recommendation: null,
      });
    }

    const forecast = forecasts[0];
    const { yhat, yhat_lower, yhat_upper } = forecast;

    // Calculate uncertainty percentage
    const uncertainty = yhat > 0 ? (yhat_upper - yhat_lower) / yhat : 1;

    // Determine budget basis based on uncertainty
    let budgetBasis: 'yhat' | 'yhat_90pct' | 'yhat_lower';
    let budgetBasisValue: number;
    let budgetBasisLabel: string;

    if (uncertainty <= 0.20) {
      budgetBasis = 'yhat';
      budgetBasisValue = yhat;
      budgetBasisLabel = 'Point estimate (high confidence)';
    } else if (uncertainty <= 0.35) {
      budgetBasis = 'yhat_90pct';
      budgetBasisValue = yhat * 0.9;
      budgetBasisLabel = '90% of estimate (medium confidence)';
    } else {
      budgetBasis = 'yhat_lower';
      budgetBasisValue = yhat_lower;
      budgetBasisLabel = 'Conservative lower bound (low confidence)';
    }

    // Calculate entertainment budget range
    const caps = ENTERTAINMENT_CAPS[params.productionLevel];
    const failsafeCap = FAILSAFE_CAPS[params.productionLevel];

    const minBudget = Math.round(budgetBasisValue * caps.min);
    const maxBudget = Math.round(budgetBasisValue * caps.max);
    const failsafeMax = Math.round(yhat_lower * failsafeCap);

    // Recommended budget is the lower of maxBudget and failsafeMax
    const recommendedMax = Math.min(maxBudget, failsafeMax);

    return NextResponse.json({
      venueId: params.venueId,
      date: params.date,
      hasForecast: true,

      // Forecast data
      forecast: {
        net_sales_yhat: Math.round(yhat),
        net_sales_lower: Math.round(yhat_lower),
        net_sales_upper: Math.round(yhat_upper),
        uncertainty_pct: Math.round(uncertainty * 100),
        model_version: forecast.model_version,
        generated_at: forecast.generated_at,
      },

      // Budget recommendation
      recommendation: {
        productionLevel: params.productionLevel,
        budgetBasis,
        budgetBasisLabel,
        budgetBasisValue: Math.round(budgetBasisValue),

        // Budget range
        minBudget,
        maxBudget,
        failsafeMax,
        recommendedMax,

        // As percentages
        minPct: (caps.min * 100).toFixed(1) + '%',
        maxPct: (caps.max * 100).toFixed(1) + '%',
        failsafePct: (failsafeCap * 100).toFixed(1) + '%',
      },

      // Human-readable summary
      summary: {
        forecastedSales: `$${Math.round(yhat).toLocaleString()}`,
        uncertaintyLevel: uncertainty <= 0.20 ? 'Low' : uncertainty <= 0.35 ? 'Medium' : 'High',
        budgetRange: `$${minBudget.toLocaleString()} - $${recommendedMax.toLocaleString()}`,
        warning: failsafeMax < maxBudget
          ? `Budget capped at $${failsafeMax.toLocaleString()} (${(failsafeCap * 100).toFixed(0)}% of conservative forecast)`
          : null,
      },
    });
  });
}
