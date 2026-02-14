export const dynamic = 'force-dynamic';

/**
 * Daily Forecast Briefing Page
 * AI-powered morning briefing for managers
 */

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { BriefingDisplay } from '@/components/labor/BriefingDisplay';
import { redirect } from 'next/navigation';
import { generateDailyBriefing, explainForecastChange, ForecastChange, AdjustmentRecommendation } from '@/lib/ai/forecast-explainer';

export default async function DailyBriefingPage() {
  await requireUser();

  const supabase = await createClient();

  // Get user's selected venue (from session or default)
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('is_active', true)
    .limit(1);

  if (!venues || venues.length === 0) {
    redirect('/');
  }

  const venueId = venues[0].id;
  const venueName = venues[0].name;

  // Fetch briefing data directly (server component can access DB directly)
  const today = new Date();
  const threeDaysOut = new Date(today);
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);

  const { data: forecasts } = await supabase
    .from('demand_forecasts')
    .select('*')
    .eq('venue_id', venueId)
    .gte('forecast_date', today.toISOString().split('T')[0])
    .lte('forecast_date', threeDaysOut.toISOString().split('T')[0])
    .order('forecast_date', { ascending: true })
    .order('shift_type', { ascending: true });

  if (!forecasts || forecasts.length === 0) {
    const briefingData = {
      venueName,
      briefing: 'No forecasts available for the next 3 days.',
      changes: [],
      adjustments: [],
      totalPotentialSavings: 0,
      forecastCount: 0,
    };
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Daily Briefing</h1>
            <p className="text-sm text-gray-500 mt-1">AI-powered forecast review</p>
          </div>
          <div className="text-sm text-gray-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <BriefingDisplay data={briefingData} />
      </div>
    );
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const changes: ForecastChange[] = [];

  for (const forecast of forecasts) {
    const { data: previousForecasts } = await supabase
      .from('demand_forecasts')
      .select('*')
      .eq('venue_id', venueId)
      .eq('forecast_date', forecast.forecast_date)
      .eq('shift_type', forecast.shift_type)
      .lte('created_at', yesterday.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (previousForecasts && previousForecasts.length > 0) {
      const prev = previousForecasts[0];
      const variancePercentage = ((forecast.covers_predicted - prev.covers_predicted) / prev.covers_predicted) * 100;
      if (Math.abs(variancePercentage) >= 10) {
        const forecastDate = new Date(forecast.forecast_date);
        changes.push({
          originalCovers: prev.covers_predicted,
          newCovers: forecast.covers_predicted,
          originalRevenue: prev.revenue_predicted || 0,
          newRevenue: forecast.revenue_predicted || 0,
          variancePercentage,
          date: forecast.forecast_date,
          dayOfWeek: forecastDate.toLocaleDateString('en-US', { weekday: 'long' }),
          factors: { historicalPattern: `${forecast.shift_type} shift pattern` },
        });
      }
    }
  }

  const { data: adjustments } = await (supabase as any)
    .from('schedule_adjustments')
    .select(`*, shift:shift_assignments(employee:employee_id(first_name, last_name), position, scheduled_start, scheduled_end)`)
    .eq('status', 'pending')
    .gte('shift.scheduled_start', today.toISOString())
    .lte('shift.scheduled_start', threeDaysOut.toISOString())
    .order('net_benefit', { ascending: false })
    .limit(5);

  const formattedAdjustments: AdjustmentRecommendation[] = (adjustments || []).map((adj: any) => {
    const shift = adj.shift;
    const employee = shift?.employee;
    const shiftStart = new Date(shift?.scheduled_start);
    return {
      type: adj.adjustment_type as 'cut' | 'add',
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown',
      position: shift?.position || 'Unknown',
      savings: adj.labor_savings,
      penalty: adj.penalty_cost ?? 0,
      netBenefit: adj.net_benefit ?? 0,
      hoursUntilShift: (shiftStart.getTime() - today.getTime()) / (1000 * 60 * 60),
      reason: adj.reason || 'Forecast variance',
    };
  });

  const totalPotentialSavings = formattedAdjustments.reduce((sum, adj) => sum + adj.netBenefit, 0);

  const briefing = await generateDailyBriefing({
    venueName,
    reviewDate: today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    upcomingForecasts: forecasts.map((f) => {
      const forecastDate = new Date(f.forecast_date);
      return {
        date: f.forecast_date,
        dayOfWeek: forecastDate.toLocaleDateString('en-US', { weekday: 'long' }),
        shift: f.shift_type,
        covers: f.covers_predicted,
        revenue: f.revenue_predicted || 0,
        confidence: (f.confidence_level ?? 0) * 100,
        laborCost: f.labor_cost_estimate || 0,
        laborPercentage: f.labor_percentage_estimate || 0,
      };
    }),
    adjustments: formattedAdjustments,
    totalPotentialSavings,
  });

  const changeExplanations = await Promise.all(
    changes.map(async (change) => ({ change, explanation: await explainForecastChange(change) }))
  );

  const briefingData = {
    venueName,
    briefing,
    changes: changeExplanations,
    adjustments: formattedAdjustments,
    totalPotentialSavings,
    forecastCount: forecasts.length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Daily Briefing</h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-powered forecast review and recommendations
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      </div>

      <BriefingDisplay data={briefingData} />
    </div>
  );
}
