/**
 * Nightly Facts API
 * Fetches pre-aggregated data from fact tables (faster than live TipSee queries)
 *
 * GET /api/nightly/facts?date=2024-01-15&venue_id=xxx
 * GET /api/nightly/facts?action=mappings - Get venue-TipSee mappings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  const date = searchParams.get('date');
  const venueId = searchParams.get('venue_id');

  const supabase = getServiceClient();

  try {
    // Return venue mappings
    if (action === 'mappings') {
      const { data, error } = await (supabase as any)
        .from('venue_tipsee_mapping')
        .select(`
          venue_id,
          tipsee_location_uuid,
          tipsee_location_name,
          venues!inner(id, name)
        `)
        .eq('is_active', true);

      if (error) throw error;

      const mappings = (data || []).map((row: any) => ({
        venue_id: row.venue_id,
        venue_name: row.venues?.name,
        tipsee_location_uuid: row.tipsee_location_uuid,
        tipsee_location_name: row.tipsee_location_name,
      }));

      return NextResponse.json({ mappings });
    }

    // Require date and venue_id for fact queries
    if (!date || !venueId) {
      return NextResponse.json(
        { error: 'date and venue_id are required' },
        { status: 400 }
      );
    }

    // Fetch all fact data in parallel
    const [
      venueDayResult,
      categoryResult,
      serverResult,
      itemResult,
    ] = await Promise.all([
      // Venue day facts (summary)
      (supabase as any)
        .from('venue_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .single(),

      // Category breakdown
      (supabase as any)
        .from('category_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .order('gross_sales', { ascending: false }),

      // Server performance
      (supabase as any)
        .from('server_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .order('gross_sales', { ascending: false }),

      // Menu items
      (supabase as any)
        .from('item_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .order('gross_sales', { ascending: false })
        .limit(15),
    ]);

    // Check if we have data
    const summary = venueDayResult.data as any;
    if (!summary) {
      return NextResponse.json({
        date,
        venue_id: venueId,
        has_data: false,
        message: 'No fact data for this date. Data may not be synced yet.',
      });
    }

    // Format response to match existing NightlyReportData structure
    const response = {
      date,
      venue_id: venueId,
      has_data: true,
      last_synced_at: summary.last_synced_at,

      summary: {
        trading_day: summary.business_date,
        total_checks: summary.checks_count,
        total_covers: summary.covers_count,
        gross_sales: summary.gross_sales,
        net_sales: summary.net_sales,
        sub_total: summary.net_sales,
        total_tax: summary.taxes_total,
        total_comps: summary.comps_total,
        total_voids: summary.voids_total,
        tips_total: summary.tips_total,
        food_sales: summary.food_sales,
        beverage_sales: summary.beverage_sales,
        wine_sales: summary.wine_sales,
        liquor_sales: summary.liquor_sales,
        beer_sales: summary.beer_sales,
        avg_check: summary.avg_check,
        avg_cover: summary.avg_cover,
        beverage_pct: summary.beverage_pct,
      },

      salesByCategory: (categoryResult.data || []).map((cat: any) => ({
        category: cat.category,
        net_sales: cat.gross_sales,
        comps: cat.comps_total,
        voids: cat.voids_total,
        quantity: cat.quantity_sold,
      })),

      servers: (serverResult.data || []).map((server: any) => ({
        employee_name: server.employee_name,
        employee_role_name: server.employee_role,
        tickets: server.checks_count,
        covers: server.covers_count,
        net_sales: server.gross_sales,
        avg_ticket: server.avg_check,
        avg_turn_mins: server.avg_turn_mins,
        avg_per_cover: server.avg_per_cover,
      })),

      menuItems: (itemResult.data || []).map((item: any) => ({
        name: item.menu_item_name,
        qty: item.quantity_sold,
        net_total: item.gross_sales,
        category: item.parent_category,
      })),
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Nightly facts API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch facts' },
      { status: 500 }
    );
  }
}
