/**
 * AI Comp Review API
 * Analyzes all comp activity and generates actionable recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchNightlyReport, fetchCompExceptions } from '@/lib/database/tipsee';
import { reviewComps, type CompReviewInput } from '@/lib/ai/comp-reviewer';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const venueId = searchParams.get('venue_id');

    if (!date || !venueId) {
      return NextResponse.json(
        { error: 'date and venue_id are required' },
        { status: 400 }
      );
    }

    // Get TipSee location UUID from venue mapping
    const supabase = getServiceClient();
    const { data: mapping, error: mappingError } = await (supabase as any)
      .from('venue_tipsee_mapping')
      .select('tipsee_location_uuid')
      .eq('venue_id', venueId)
      .single();

    if (mappingError || !mapping?.tipsee_location_uuid) {
      return NextResponse.json(
        { error: 'No TipSee mapping found for this venue' },
        { status: 404 }
      );
    }

    // Get venue name
    const { data: venue } = await (supabase as any)
      .from('venues')
      .select('name')
      .eq('id', venueId)
      .single();

    const venueName = venue?.name || 'Unknown Venue';

    // Fetch nightly report data (includes all comps)
    const reportData = await fetchNightlyReport(date, mapping.tipsee_location_uuid);

    // Fetch comp exceptions
    const exceptionsData = await fetchCompExceptions(date, mapping.tipsee_location_uuid);

    // Get historical data for context (last 7 days)
    const historicalData = await fetchHistoricalCompData(
      mapping.tipsee_location_uuid,
      date
    );

    // Prepare input for AI review
    const reviewInput: CompReviewInput = {
      date,
      venueName,
      allComps: reportData.detailedComps.map(comp => ({
        check_id: comp.check_id,
        table_name: comp.table_name,
        server: comp.server,
        comp_total: comp.comp_total,
        check_total: comp.check_total,
        reason: comp.reason,
        comped_items: comp.comped_items.map(itemStr => {
          // Parse "Item Name ($123.45)" format
          const match = itemStr.match(/^(.+)\s+\(\$([0-9.]+)\)$/);
          if (match) {
            return {
              name: match[1].replace(/\s+x\d+$/, ''), // Remove "x2" quantity suffix
              quantity: 1,
              amount: parseFloat(match[2]),
            };
          }
          return { name: itemStr, quantity: 1, amount: 0 };
        }),
      })),
      exceptions: exceptionsData,
      summary: {
        total_comps: reportData.summary.total_comps,
        net_sales: reportData.summary.net_sales,
        comp_pct: reportData.summary.net_sales > 0
          ? (reportData.summary.total_comps / reportData.summary.net_sales) * 100
          : 0,
        total_checks: reportData.summary.total_checks,
      },
      historical: historicalData,
    };

    // Run AI review
    const review = await reviewComps(reviewInput);

    return NextResponse.json({
      success: true,
      data: review,
    });
  } catch (error: any) {
    console.error('AI Comp Review API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Fetch historical comp data for context
 */
async function fetchHistoricalCompData(
  locationUuid: string,
  currentDate: string
): Promise<{
  avg_daily_comp_pct: number;
  avg_daily_comp_total: number;
  previous_week_comp_pct: number;
}> {
  const { getTipseePool } = await import('@/lib/database/tipsee');
  const pool = getTipseePool();

  try {
    // Get last 7 days (excluding current date)
    const result = await pool.query(
      `SELECT
        AVG(CASE WHEN revenue_total > 0 THEN (comp_total / revenue_total) * 100 ELSE 0 END) as avg_comp_pct,
        AVG(comp_total) as avg_comp_total,
        SUM(comp_total) as total_comps,
        SUM(revenue_total) as total_revenue
      FROM public.tipsee_checks
      WHERE location_uuid = $1
        AND trading_day < $2
        AND trading_day >= (DATE($2) - INTERVAL '7 days')::date
      `,
      [locationUuid, currentDate]
    );

    const data = result.rows[0];
    const avgCompPct = parseFloat(data?.avg_comp_pct || '0');
    const avgCompTotal = parseFloat(data?.avg_comp_total || '0');
    const totalComps = parseFloat(data?.total_comps || '0');
    const totalRevenue = parseFloat(data?.total_revenue || '0');
    const previousWeekCompPct = totalRevenue > 0 ? (totalComps / totalRevenue) * 100 : 0;

    return {
      avg_daily_comp_pct: avgCompPct,
      avg_daily_comp_total: avgCompTotal,
      previous_week_comp_pct: previousWeekCompPct,
    };
  } catch (error) {
    console.error('Error fetching historical comp data:', error);
    return {
      avg_daily_comp_pct: 0,
      avg_daily_comp_total: 0,
      previous_week_comp_pct: 0,
    };
  }
}
