/**
 * Daily Forecast Briefing API
 * Generates AI-powered morning briefing with forecast changes and recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validateQuery, uuid } from '@/lib/validate';
import { z } from 'zod';
import {
  explainForecastChange,
  generateDailyBriefing,
  ForecastChange,
  AdjustmentRecommendation,
} from '@/lib/ai/forecast-explainer';

const dailyBriefingQuerySchema = z.object({
  venue_id: uuid,
});

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':daily-briefing');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const params = validateQuery(dailyBriefingQuerySchema, searchParams);
    assertVenueAccess(params.venue_id, venueIds);

    const supabase = await createClient();
    const { data: venue } = await supabase
      .from('venues')
      .select('name')
      .eq('id', params.venue_id)
      .single();

    if (!venue) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Venue not found' };
    }

    // Get upcoming forecasts (next 3 days)
    const today = new Date();
    const threeDaysOut = new Date(today);
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);

    const { data: forecasts } = await supabase
      .from('demand_forecasts')
      .select('*')
      .eq('venue_id', params.venue_id)
      .gte('forecast_date', today.toISOString().split('T')[0])
      .lte('forecast_date', threeDaysOut.toISOString().split('T')[0])
      .order('forecast_date', { ascending: true })
      .order('shift_type', { ascending: true });

    if (!forecasts || forecasts.length === 0) {
      return NextResponse.json({
        venueName: venue.name,
        briefing: 'No forecasts available for the next 3 days.',
        changes: [],
        adjustments: [],
      });
    }

    // Detect forecast changes (compare to forecasts from 24 hours ago)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const changes: ForecastChange[] = [];

    for (const forecast of forecasts) {
      // Get previous forecast for same date/shift (created yesterday or earlier)
      const { data: previousForecasts } = await supabase
        .from('demand_forecasts')
        .select('*')
        .eq('venue_id', params.venue_id)
        .eq('forecast_date', forecast.forecast_date)
        .eq('shift_type', forecast.shift_type)
        .lte('created_at', yesterday.toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (previousForecasts && previousForecasts.length > 0) {
        const prev = previousForecasts[0];
        const variancePercentage =
          ((forecast.covers_predicted - prev.covers_predicted) /
            prev.covers_predicted) *
          100;

        // Only include if variance > 10%
        if (Math.abs(variancePercentage) >= 10) {
          const forecastDate = new Date(forecast.forecast_date);
          const dayOfWeek = forecastDate.toLocaleDateString('en-US', {
            weekday: 'long',
          });

          changes.push({
            originalCovers: prev.covers_predicted,
            newCovers: forecast.covers_predicted,
            originalRevenue: prev.revenue_predicted || 0,
            newRevenue: forecast.revenue_predicted || 0,
            variancePercentage,
            date: forecast.forecast_date,
            dayOfWeek,
            factors: {
              // TODO: Pull actual weather/reservation/event data
              historicalPattern: `${forecast.shift_type} shift pattern`,
            },
          });
        }
      }
    }

    // Get schedule adjustments (if any exist for upcoming shifts)
    const { data: adjustments } = await supabase
      .from('schedule_adjustments')
      .select(
        `
        *,
        shift:shift_assignments(
          employee:employee_id(first_name, last_name),
          position,
          scheduled_start,
          scheduled_end
        )
      `
      )
      .eq('status', 'pending')
      .gte(
        'shift.scheduled_start',
        today.toISOString()
      )
      .lte(
        'shift.scheduled_start',
        threeDaysOut.toISOString()
      )
      .order('net_benefit', { ascending: false })
      .limit(5);

    // Format adjustments for briefing
    const formattedAdjustments: AdjustmentRecommendation[] =
      (adjustments || []).map((adj) => {
        const shift = adj.shift as any;
        const employee = shift?.employee;
        const shiftStart = new Date(shift?.scheduled_start);
        const hoursUntilShift =
          (shiftStart.getTime() - today.getTime()) / (1000 * 60 * 60);

        return {
          type: adj.adjustment_type as 'cut' | 'add',
          employeeName: employee
            ? `${employee.first_name} ${employee.last_name}`
            : 'Unknown',
          position: shift?.position || 'Unknown',
          savings: adj.labor_savings,
          penalty: adj.penalty_cost,
          netBenefit: adj.net_benefit,
          hoursUntilShift,
          reason: adj.reason || 'Forecast variance',
        };
      });

    // Calculate total potential savings
    const totalPotentialSavings = formattedAdjustments.reduce(
      (sum, adj) => sum + adj.netBenefit,
      0
    );

    // Generate AI briefing
    const briefing = await generateDailyBriefing({
      venueName: venue.name,
      reviewDate: today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      upcomingForecasts: forecasts.map((f) => {
        const forecastDate = new Date(f.forecast_date);
        return {
          date: f.forecast_date,
          dayOfWeek: forecastDate.toLocaleDateString('en-US', {
            weekday: 'long',
          }),
          shift: f.shift_type,
          covers: f.covers_predicted,
          revenue: f.revenue_predicted || 0,
          confidence: f.confidence_level * 100,
          laborCost: f.labor_cost_estimate || 0,
          laborPercentage: f.labor_percentage_estimate || 0,
        };
      }),
      adjustments: formattedAdjustments,
      totalPotentialSavings,
    });

    // Generate explanations for each significant change
    const changeExplanations = await Promise.all(
      changes.map(async (change) => ({
        change,
        explanation: await explainForecastChange(change),
      }))
    );

    return NextResponse.json({
      venueName: venue.name,
      briefing,
      changes: changeExplanations,
      adjustments: formattedAdjustments,
      totalPotentialSavings,
      forecastCount: forecasts.length,
    });
  });
}
