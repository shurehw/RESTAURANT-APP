/**
 * EXAMPLE: Venue Health API with Sentry Integration
 * This is a reference implementation showing how to add Sentry monitoring
 * Compare with route.ts to see the additions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getFiscalPeriod, type FiscalCalendarType } from '@/lib/fiscal-calendar';
import {
  setRestaurantContext,
  captureRestaurantError,
  trackAPIPerformance,
} from '@/lib/monitoring/sentry';
import * as Sentry from '@sentry/nextjs';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const view = searchParams.get('view') || 'daily';
  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const venueId = searchParams.get('venue_id');

  // Set restaurant context for this request
  setRestaurantContext({
    venueId: venueId || undefined,
    businessDate: dateParam,
    operation: 'health_check',
  });

  const supabase = getServiceClient();

  try {
    // Get fiscal calendar settings from organization_settings
    const { data: settings } = await (supabase as any)
      .from('organization_settings')
      .select('fiscal_calendar_type, fiscal_year_start_date')
      .limit(1)
      .single();

    const calendarType: FiscalCalendarType = settings?.fiscal_calendar_type || '4-4-5';
    const fyStartDate: string | null = settings?.fiscal_year_start_date || null;

    // Compute date range based on view
    let startDate: string;
    let endDate: string;
    let periodLabel: string;

    if (view === 'weekly') {
      const d = new Date(dateParam + 'T12:00:00');
      const dayOfWeek = d.getDay();
      const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(d);
      monday.setDate(monday.getDate() - daysFromMon);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      startDate = monday.toISOString().split('T')[0];
      endDate = sunday.toISOString().split('T')[0];
      periodLabel = `Week of ${startDate}`;
    } else if (view === 'period') {
      const fp = getFiscalPeriod(dateParam, calendarType, fyStartDate);
      startDate = fp.periodStartDate;
      endDate = fp.periodEndDate;
      periodLabel = `P${fp.fiscalPeriod} FY${fp.fiscalYear} (Week ${fp.weekInPeriod})`;
    } else {
      startDate = dateParam;
      endDate = dateParam;
      periodLabel = dateParam;
    }

    // Fetch health data for the date range
    let healthQuery = (supabase as any)
      .from('venue_health_daily')
      .select('venue_id, date, health_score, status, confidence, signal_count, top_drivers')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (venueId) {
      healthQuery = healthQuery.eq('venue_id', venueId);
    }

    const { data: healthRows, error: healthError } = await healthQuery;
    if (healthError) {
      // Capture database errors with context
      captureRestaurantError(
        new Error(`Failed to fetch health data: ${healthError.message}`),
        {
          venueId: venueId || undefined,
          businessDate: dateParam,
          operation: 'health_check',
        },
        'error'
      );
      throw healthError;
    }

    // Fetch venue names
    const { data: venues } = await (supabase as any)
      .from('venues')
      .select('id, name')
      .eq('is_active', true);

    const venueNames = new Map<string, string>();
    for (const v of venues || []) venueNames.set(v.id, v.name);

    // Group by venue and compute aggregates
    const byVenue = new Map<string, typeof healthRows>();
    for (const row of healthRows || []) {
      const existing = byVenue.get(row.venue_id) || [];
      existing.push(row);
      byVenue.set(row.venue_id, existing);
    }

    const venueSummaries = [];
    for (const [vid, rows] of byVenue) {
      const avgScore = rows.reduce((s: number, r: any) => s + Number(r.health_score), 0) / rows.length;
      const latestRow = rows[rows.length - 1];
      const worstDay = rows.reduce((worst: any, r: any) => r.health_score < worst.health_score ? r : worst, rows[0]);

      const aggStatus = avgScore >= 80 ? 'GREEN' : avgScore >= 65 ? 'YELLOW' : avgScore >= 50 ? 'ORANGE' : 'RED';

      venueSummaries.push({
        venue_id: vid,
        venue_name: venueNames.get(vid) || 'Unknown',
        avg_score: Math.round(avgScore * 100) / 100,
        status: view === 'daily' ? latestRow.status : aggStatus,
        days_count: rows.length,
        latest_score: Number(latestRow.health_score),
        latest_drivers: latestRow.top_drivers,
        worst_day: { date: worstDay.date, score: Number(worstDay.health_score), status: worstDay.status },
        daily: rows.map((r: any) => ({
          date: r.date,
          score: Number(r.health_score),
          status: r.status,
          confidence: Number(r.confidence),
          signal_count: r.signal_count,
          drivers: r.top_drivers,
        })),
      });
    }

    venueSummaries.sort((a, b) => a.avg_score - b.avg_score);

    // Portfolio-level stats
    const allScores = venueSummaries.map(v => v.avg_score);
    const statusCounts: Record<string, number> = {};
    for (const v of venueSummaries) {
      statusCounts[v.status] = (statusCounts[v.status] || 0) + 1;
    }

    // If single venue, fetch signals + actions
    let signals = null;
    let actions = null;
    if (venueId) {
      const { data: sigRows, error: sigError } = await (supabase as any)
        .from('venue_health_signals_daily')
        .select('signal, risk, confidence, reason, raw_inputs, date, computed_at')
        .eq('venue_id', venueId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (sigError) {
        // Log but don't fail - signals are supplementary
        captureRestaurantError(
          new Error(`Failed to fetch health signals: ${sigError.message}`),
          { venueId, businessDate: dateParam, operation: 'health_check' },
          'warning'
        );
      }
      signals = sigRows;

      const { data: actRows } = await (supabase as any)
        .from('venue_health_actions')
        .select('*')
        .eq('venue_id', venueId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('created_at', { ascending: false });
      actions = actRows;
    }

    // Track API performance
    const duration = Date.now() - startTime;
    trackAPIPerformance('/api/health', 'GET', 200, duration);

    // Add breadcrumb for successful request
    Sentry.addBreadcrumb({
      category: 'api',
      message: `Health API: ${view} view for ${dateParam}`,
      level: 'info',
      data: {
        view,
        date: dateParam,
        venue_id: venueId,
        venue_count: venueSummaries.length,
        duration_ms: duration,
      },
    });

    return NextResponse.json({
      view,
      date: dateParam,
      start_date: startDate,
      end_date: endDate,
      period_label: periodLabel,
      portfolio: {
        venue_count: venueSummaries.length,
        avg_score: allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length * 100) / 100 : 0,
        status_counts: statusCounts,
      },
      venues: venueSummaries,
      signals,
      actions,
    });

  } catch (error: any) {
    // Track error in Sentry with full context
    const duration = Date.now() - startTime;
    trackAPIPerformance('/api/health', 'GET', 500, duration);

    captureRestaurantError(
      error,
      {
        venueId: venueId || undefined,
        businessDate: dateParam,
        operation: 'health_check',
      },
      'error'
    );

    console.error('Health API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch health data' },
      { status: 500 }
    );
  }
}
