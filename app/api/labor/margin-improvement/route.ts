import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import {
  calculateMarginImprovement,
  calculateAnnualImpact,
  compareMultiplePeriods,
  type MarginBaseline,
  type MarginCurrent
} from '@/lib/margin-improvement-calculator';

/**
 * GET /api/labor/margin-improvement
 * Get margin improvement dashboard data
 *
 * Query params:
 * - venue_id: string (required)
 * - period: 'week' | 'month' | 'quarter' (default: 'week')
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const searchParams = request.nextUrl.searchParams;
    const venue_id = searchParams.get('venue_id');
    const period = searchParams.get('period') || 'week';

    if (!venue_id) {
      return NextResponse.json(
        { error: 'venue_id is required' },
        { status: 400 }
      );
    }

    // Verify user access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: access } = await (supabase as any)
      .from('user_venue_access')
      .select('venue_id')
      .eq('user_id', user.id)
      .eq('venue_id', venue_id)
      .single();

    if (!access) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Calculate date ranges
    const now = new Date();
    let days_back: number;
    let baseline_days_back: number;

    switch (period) {
      case 'month':
        days_back = 30;
        baseline_days_back = 60; // Compare to previous month
        break;
      case 'quarter':
        days_back = 90;
        baseline_days_back = 180; // Compare to previous quarter
        break;
      case 'week':
      default:
        days_back = 7;
        baseline_days_back = 14; // Compare to previous week
        break;
    }

    const current_end = now.toISOString().split('T')[0];
    const current_start = new Date(now.getTime() - days_back * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const baseline_end = current_start;
    const baseline_start = new Date(now.getTime() - baseline_days_back * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    // Get current period data
    const { data: current_schedules } = await supabase
      .from('weekly_schedules')
      .select('total_labor_cost, total_labor_hours, projected_revenue, overall_cplh, service_quality_score')
      .eq('venue_id', venue_id)
      .gte('week_start_date', current_start)
      .lte('week_start_date', current_end);

    // Get baseline period data
    const { data: baseline_schedules } = await supabase
      .from('weekly_schedules')
      .select('total_labor_cost, total_labor_hours, projected_revenue, overall_cplh, service_quality_score')
      .eq('venue_id', venue_id)
      .gte('week_start_date', baseline_start)
      .lt('week_start_date', baseline_end);

    if (!current_schedules || current_schedules.length === 0 ||
        !baseline_schedules || baseline_schedules.length === 0) {
      return NextResponse.json({
        message: 'Insufficient data for margin analysis',
        current_period: null,
        baseline: null,
        improvement: null,
        trend: [],
        recommendations: ['Ensure schedules are being created and tracked consistently']
      });
    }

    // Aggregate current period
    const current: MarginCurrent = {
      labor_cost: current_schedules.reduce((sum, s) => sum + (s.total_labor_cost || 0), 0),
      revenue: current_schedules.reduce((sum, s) => sum + (s.projected_revenue || 0), 0),
      total_hours: current_schedules.reduce((sum, s) => sum + (s.total_labor_hours || 0), 0),
      cplh: 0,
      labor_percentage: 0,
      service_quality_score: current_schedules.reduce((sum, s) => sum + (s.service_quality_score || 0), 0) / current_schedules.length
    };

    current.labor_percentage = current.revenue > 0 ? (current.labor_cost / current.revenue) * 100 : 0;
    current.cplh = current_schedules
      .filter(s => s.overall_cplh && s.overall_cplh > 0)
      .reduce((sum, s) => sum + (s.overall_cplh || 0), 0) /
      current_schedules.filter(s => s.overall_cplh && s.overall_cplh > 0).length || 0;

    // Aggregate baseline period
    const baseline: MarginBaseline = {
      labor_cost: baseline_schedules.reduce((sum, s) => sum + (s.total_labor_cost || 0), 0),
      revenue: baseline_schedules.reduce((sum, s) => sum + (s.projected_revenue || 0), 0),
      total_hours: baseline_schedules.reduce((sum, s) => sum + (s.total_labor_hours || 0), 0),
      cplh: 0,
      labor_percentage: 0,
      service_quality_score: baseline_schedules.reduce((sum, s) => sum + (s.service_quality_score || 0), 0) / baseline_schedules.length
    };

    baseline.labor_percentage = baseline.revenue > 0 ? (baseline.labor_cost / baseline.revenue) * 100 : 0;
    baseline.cplh = baseline_schedules
      .filter(s => s.overall_cplh && s.overall_cplh > 0)
      .reduce((sum, s) => sum + (s.overall_cplh || 0), 0) /
      baseline_schedules.filter(s => s.overall_cplh && s.overall_cplh > 0).length || 0;

    // Calculate improvement
    const improvement = calculateMarginImprovement(baseline, current);

    // Calculate annual impact
    const weekly_savings = improvement.cost_savings / (days_back / 7);
    const annual_impact = calculateAnnualImpact(weekly_savings);

    // Get trend data (last 12 weeks)
    const trend_start = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const { data: trend_data } = await supabase
      .from('weekly_schedules')
      .select('week_start_date, total_labor_cost, projected_revenue, overall_cplh, service_quality_score')
      .eq('venue_id', venue_id)
      .gte('week_start_date', trend_start)
      .order('week_start_date', { ascending: true });

    const trend = trend_data?.map((week: any) => ({
      period: week.week_start_date,
      labor_pct: (week.projected_revenue || 0) > 0 ? ((week.total_labor_cost || 0) / week.projected_revenue) * 100 : 0,
      cplh: week.overall_cplh || 0,
      quality_score: week.service_quality_score || 0
    })) || [];

    return NextResponse.json({
      current_period: {
        labor_percentage: current.labor_percentage,
        cplh: current.cplh,
        cost: current.labor_cost,
        revenue: current.revenue,
        service_quality: current.service_quality_score
      },
      baseline: {
        labor_percentage: baseline.labor_percentage,
        cplh: baseline.cplh,
        cost: baseline.labor_cost,
        revenue: baseline.revenue,
        service_quality: baseline.service_quality_score
      },
      improvement: {
        labor_pct_improvement: improvement.improvement_pct,
        cplh_improvement: current.cplh - baseline.cplh,
        cost_savings: improvement.cost_savings,
        margin_improvement: improvement.improvement_pct,
        quality_impact: improvement.quality_impact
      },
      annual_impact,
      trend,
      recommendations: improvement.recommendations.slice(0, 5), // Top 5 recommendations
      summary: improvement.roi_summary
    });

  } catch (error) {
    console.error('Margin improvement error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate margin improvement' },
      { status: 500 }
    );
  }
}
