import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { calculateServiceQualityScore } from '@/lib/service-quality-calculator';
import { calculateCPLH } from '@/lib/cplh-calculator';

/**
 * POST /api/labor/optimize/scenarios
 * Generate multiple optimization scenarios for comparison
 *
 * Body:
 * - venue_id: string
 * - week_start_date: string (YYYY-MM-DD)
 * - scenarios?: string[] (default: ['minimize_cost', 'balanced', 'maximize_quality'])
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { venue_id, week_start_date, scenarios: requested_scenarios } = body;

    if (!venue_id || !week_start_date) {
      return NextResponse.json(
        { error: 'venue_id and week_start_date are required' },
        { status: 400 }
      );
    }

    // Verify user access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: access } = await supabase
      .from('user_venue_access')
      .select('venue_id')
      .eq('user_id', user.id)
      .eq('venue_id', venue_id)
      .single();

    if (!access) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Define scenarios to generate
    const scenarios_to_run = requested_scenarios || ['minimize_cost', 'balanced', 'maximize_quality'];

    // Get optimization settings
    const { data: settings } = await supabase
      .from('labor_optimization_settings')
      .select('*')
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .single();

    // Get service quality standards
    const { data: quality_standards } = await supabase
      .from('service_quality_standards')
      .select('*')
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .is('shift_type', null)
      .single();

    // Get demand forecast for the week
    const week_end = new Date(week_start_date);
    week_end.setDate(week_end.getDate() + 6);

    const { data: forecasts } = await supabase
      .from('demand_forecasts')
      .select('*')
      .eq('venue_id', venue_id)
      .gte('forecast_date', week_start_date)
      .lte('forecast_date', week_end.toISOString().split('T')[0]);

    if (!forecasts || forecasts.length === 0) {
      return NextResponse.json(
        { error: 'No demand forecasts available for this week' },
        { status: 404 }
      );
    }

    // Aggregate forecasted covers and revenue
    const total_covers = forecasts.reduce((sum, f) => sum + (f.covers_predicted || 0), 0);
    const total_revenue = forecasts.reduce((sum, f) => sum + (f.revenue_predicted || 0), 0);

    // Generate scenarios (simplified - in production, call Python optimizer)
    const scenario_results = scenarios_to_run.map((mode: string) => {
      let cost_multiplier: number;
      let quality_score: number;
      let cplh_multiplier: number;

      switch (mode) {
        case 'minimize_cost':
          cost_multiplier = 0.85; // 15% cost reduction
          quality_score = 0.78; // Lower quality
          cplh_multiplier = 1.15; // Higher efficiency
          break;
        case 'maximize_quality':
          cost_multiplier = 1.10; // 10% cost increase
          quality_score = 0.95; // Higher quality
          cplh_multiplier = 0.90; // Lower efficiency
          break;
        case 'balanced':
        default:
          cost_multiplier = 1.00; // Baseline
          quality_score = 0.87; // Good quality
          cplh_multiplier = 1.05; // Moderate efficiency
          break;
      }

      // Calculate baseline labor cost (27.5% of revenue)
      const baseline_labor_pct = settings?.target_labor_percentage || 27.5;
      const baseline_cost = total_revenue * (baseline_labor_pct / 100);

      const total_cost = baseline_cost * cost_multiplier;
      const labor_pct = (total_cost / total_revenue) * 100;
      const cost_savings = baseline_cost - total_cost;

      // Estimate hours (assume $20/hour average)
      const avg_hourly_rate = 20;
      const total_hours = total_cost / avg_hourly_rate;

      // Calculate CPLH
      const target_cplh = 10.0;
      const overall_cplh = target_cplh * cplh_multiplier;

      // Quality violations
      const violations = [];
      if (quality_score < (quality_standards?.min_service_quality_score || 0.85)) {
        violations.push(`Quality score ${(quality_score * 100).toFixed(0)}% below minimum`);
      }

      // Trade-offs
      let vs_current = '';
      let pros: string[] = [];
      let cons: string[] = [];

      switch (mode) {
        case 'minimize_cost':
          vs_current = 'Lowest cost option';
          pros = ['Maximum cost savings', 'Highest CPLH efficiency', 'Best margin improvement'];
          cons = ['Service quality risk', 'Potential guest complaints', 'Staff may be overworked'];
          break;
        case 'maximize_quality':
          vs_current = 'Premium service option';
          pros = ['Exceptional service quality', 'Guest satisfaction', 'Staff well-supported'];
          cons = ['Highest labor cost', 'Lower margins', 'May be over-staffed during slow periods'];
          break;
        case 'balanced':
          vs_current = 'Recommended option';
          pros = ['Good quality maintained', 'Reasonable cost savings', 'Sustainable long-term'];
          cons = ['Moderate improvement in all areas', 'Not maximum in any single metric'];
          break;
      }

      return {
        mode,
        total_cost: Math.round(total_cost),
        total_hours: Math.round(total_hours * 10) / 10,
        overall_cplh: Math.round(overall_cplh * 10) / 10,
        service_quality_score: quality_score,
        labor_percentage: Math.round(labor_pct * 10) / 10,
        cost_savings: Math.round(cost_savings),
        margin_improvement: Math.round((baseline_labor_pct - labor_pct) * 10) / 10,
        violations,
        trade_offs: {
          vs_current,
          pros,
          cons
        },
        recommended: mode === 'balanced'
      };
    });

    // Determine recommended scenario
    const recommended = scenario_results.find((s: any) => s.mode === 'balanced') || scenario_results[0];

    return NextResponse.json({
      scenarios: scenario_results,
      recommended_scenario: recommended.mode,
      reasoning: recommended.trade_offs.vs_current,
      forecast_summary: {
        total_covers,
        total_revenue,
        week_start_date,
        week_end_date: week_end.toISOString().split('T')[0]
      },
      settings: {
        target_labor_percentage: settings?.target_labor_percentage || 27.5,
        optimization_mode: settings?.optimization_mode || 'balanced',
        require_manager_approval: settings?.require_manager_approval ?? true
      }
    });

  } catch (error) {
    console.error('Optimization scenarios error:', error);
    return NextResponse.json(
      { error: 'Failed to generate optimization scenarios' },
      { status: 500 }
    );
  }
}
