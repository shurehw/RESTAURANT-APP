/**
 * Venue Health API
 * Serves health scores, signals, and actions for the health report page.
 *
 * GET /api/health?view=daily&date=2026-02-07
 * GET /api/health?view=weekly&date=2026-02-07
 * GET /api/health?view=period&date=2026-02-07
 * GET /api/health?view=daily&venue_id=xxx&date=2026-02-07  (single venue detail)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getFiscalPeriod, type FiscalCalendarType } from '@/lib/fiscal-calendar';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const view = searchParams.get('view') || 'daily';
  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const venueId = searchParams.get('venue_id');

  const supabase = getServiceClient();

  try {
    // Get fiscal calendar settings for period calculations
    const { data: settings } = await (supabase as any)
      .from('proforma_settings')
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
      // Current fiscal week: Monday to Sunday containing the date
      const d = new Date(dateParam + 'T12:00:00');
      const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon...
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
      // daily
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
    if (healthError) throw healthError;

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

      // Determine aggregate status from avg score
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

    // Sort: worst health first
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
      const { data: sigRows } = await (supabase as any)
        .from('venue_health_signals_daily')
        .select('signal, risk, confidence, reason, raw_inputs, date, computed_at')
        .eq('venue_id', venueId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
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
    console.error('Health API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch health data' },
      { status: 500 }
    );
  }
}
