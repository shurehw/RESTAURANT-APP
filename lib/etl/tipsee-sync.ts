/**
 * TipSee ETL Sync
 * Extracts data from TipSee POS and loads into our analytics fact tables
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import { getTipseePool } from '@/lib/database/tipsee';
import { getServiceClient } from '@/lib/supabase/service';

// Types for fact tables
export interface VenueDayFact {
  venue_id: string;
  business_date: string;
  gross_sales: number;
  net_sales: number;
  food_sales: number;
  beverage_sales: number;
  wine_sales: number;
  liquor_sales: number;
  beer_sales: number;
  other_sales: number;
  discounts_total: number;
  comps_total: number;
  voids_total: number;
  taxes_total: number;
  tips_total: number;
  checks_count: number;
  covers_count: number;
  items_sold: number;
  is_complete: boolean;
}

export interface CategoryDayFact {
  venue_id: string;
  business_date: string;
  category: string;
  gross_sales: number;
  net_sales: number;
  quantity_sold: number;
  comps_total: number;
  voids_total: number;
}

export interface ServerDayFact {
  venue_id: string;
  business_date: string;
  employee_name: string;
  employee_role: string | null;
  gross_sales: number;
  checks_count: number;
  covers_count: number;
  tips_total: number;
  comps_total: number;
  avg_turn_mins: number;
}

export interface ItemDayFact {
  venue_id: string;
  business_date: string;
  menu_item_name: string;
  parent_category: string | null;
  category: string | null;
  quantity_sold: number;
  gross_sales: number;
  net_sales: number;
  comps_total: number;
  voids_total: number;
}

export interface SyncResult {
  success: boolean;
  etl_run_id: string;
  venue_id: string;
  business_date: string;
  rows_extracted: number;
  rows_loaded: number;
  duration_ms: number;
  error?: string;
}

// Category mapping for Food/Bev breakdown
const CATEGORY_MAPPING: Record<string, 'food' | 'beverage' | 'wine' | 'liquor' | 'beer' | 'other'> = {
  'Food': 'food',
  'FOOD': 'food',
  'Entree': 'food',
  'Appetizer': 'food',
  'Dessert': 'food',
  'Side': 'food',
  'Salad': 'food',
  'Soup': 'food',
  'Beverage': 'beverage',
  'BEVERAGE': 'beverage',
  'Drinks': 'beverage',
  'Wine': 'wine',
  'WINE': 'wine',
  'Wine by Glass': 'wine',
  'Wine by Bottle': 'wine',
  'BTG': 'wine',
  'BTB': 'wine',
  'Liquor': 'liquor',
  'LIQUOR': 'liquor',
  'Spirits': 'liquor',
  'Cocktail': 'liquor',
  'Cocktails': 'liquor',
  'Beer': 'beer',
  'BEER': 'beer',
  'Beers': 'beer',
  'Draft': 'beer',
};

function getCategoryType(category: string | null): 'food' | 'beverage' | 'wine' | 'liquor' | 'beer' | 'other' {
  if (!category) return 'other';
  return CATEGORY_MAPPING[category] || 'other';
}

function computeHash(data: Record<string, any>): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  return createHash('sha256').update(str).digest('hex').substring(0, 16);
}

/**
 * Get venue mappings from our database
 */
export async function getVenueTipseeMappings(): Promise<Array<{
  venue_id: string;
  tipsee_location_uuid: string;
  venue_name: string;
}>> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('venue_tipsee_mapping')
    .select(`
      venue_id,
      tipsee_location_uuid,
      venues!inner(name)
    `)
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch venue mappings:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    venue_id: row.venue_id,
    tipsee_location_uuid: row.tipsee_location_uuid,
    venue_name: row.venues?.name || 'Unknown',
  }));
}

/**
 * Extract and load data for a single venue and date
 */
export async function syncVenueDay(
  venueId: string,
  tipseeLocationUuid: string,
  businessDate: string
): Promise<SyncResult> {
  const startTime = Date.now();
  const supabase = getServiceClient();
  const pool = getTipseePool();

  // Create ETL run record
  const { data: etlRun, error: etlError } = await (supabase as any)
    .from('etl_runs')
    .insert({
      source: 'tipsee',
      venue_id: venueId,
      business_date: businessDate,
      status: 'running',
    })
    .select()
    .single();

  if (etlError || !etlRun) {
    return {
      success: false,
      etl_run_id: '',
      venue_id: venueId,
      business_date: businessDate,
      rows_extracted: 0,
      rows_loaded: 0,
      duration_ms: Date.now() - startTime,
      error: `Failed to create ETL run: ${etlError?.message}`,
    };
  }

  const etlRunId = (etlRun as any).id;
  let rowsExtracted = 0;
  let rowsLoaded = 0;

  try {
    // 1. Extract summary data from TipSee
    const summaryResult = await pool.query(
      `SELECT
        trading_day,
        COUNT(*) as total_checks,
        SUM(guest_count) as total_covers,
        SUM(revenue_total) as gross_sales,
        SUM(sub_total) as net_sales,
        SUM(tax_total) as total_tax,
        SUM(comp_total) as total_comps,
        SUM(void_total) as total_voids
      FROM public.tipsee_checks
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY trading_day`,
      [tipseeLocationUuid, businessDate]
    );

    const summary = summaryResult.rows[0] || {
      total_checks: 0,
      total_covers: 0,
      gross_sales: 0,
      net_sales: 0,
      total_tax: 0,
      total_comps: 0,
      total_voids: 0,
    };
    rowsExtracted += summaryResult.rowCount || 0;

    // 2. Extract category breakdown
    const categoryResult = await pool.query(
      `SELECT
        COALESCE(parent_category, 'Other') as category,
        SUM(price * quantity) as gross_sales,
        SUM(price * quantity) as net_sales,
        SUM(quantity) as quantity_sold,
        SUM(comp_total) as comps_total,
        SUM(void_value) as voids_total
      FROM public.tipsee_check_items
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY parent_category
      ORDER BY gross_sales DESC`,
      [tipseeLocationUuid, businessDate]
    );
    rowsExtracted += categoryResult.rowCount || 0;

    // Calculate category breakdowns
    let foodSales = 0, beverageSales = 0, wineSales = 0, liquorSales = 0, beerSales = 0, otherSales = 0;
    let totalItemsSold = 0;

    for (const row of categoryResult.rows) {
      const categoryType = getCategoryType(row.category);
      const sales = parseFloat(row.gross_sales) || 0;
      totalItemsSold += parseInt(row.quantity_sold) || 0;

      switch (categoryType) {
        case 'food': foodSales += sales; break;
        case 'wine': wineSales += sales; beverageSales += sales; break;
        case 'liquor': liquorSales += sales; beverageSales += sales; break;
        case 'beer': beerSales += sales; beverageSales += sales; break;
        case 'beverage': beverageSales += sales; break;
        default: otherSales += sales;
      }
    }

    // 3. Extract server performance
    const serverResult = await pool.query(
      `SELECT
        employee_name,
        employee_role_name as employee_role,
        COUNT(*) as checks_count,
        SUM(guest_count) as covers_count,
        SUM(revenue_total) as gross_sales,
        SUM(comp_total) as comps_total,
        ROUND(AVG(CASE WHEN close_time > open_time
          THEN EXTRACT(EPOCH FROM (close_time - open_time))/60 END)::numeric, 0) as avg_turn_mins
      FROM public.tipsee_checks
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY employee_name, employee_role_name
      ORDER BY gross_sales DESC`,
      [tipseeLocationUuid, businessDate]
    );
    rowsExtracted += serverResult.rowCount || 0;

    // 4. Extract item-level data (top 100 items)
    const itemResult = await pool.query(
      `SELECT
        name as menu_item_name,
        parent_category,
        category,
        SUM(quantity) as quantity_sold,
        SUM(price * quantity) as gross_sales,
        SUM(price * quantity) as net_sales,
        SUM(comp_total) as comps_total,
        SUM(void_value) as voids_total
      FROM public.tipsee_check_items
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY name, parent_category, category
      ORDER BY gross_sales DESC
      LIMIT 100`,
      [tipseeLocationUuid, businessDate]
    );
    rowsExtracted += itemResult.rowCount || 0;

    // 5. Extract tips data
    const tipsResult = await pool.query(
      `SELECT COALESCE(SUM(tip_amount), 0) as tips_total
       FROM public.tipsee_payments p
       JOIN public.tipsee_checks c ON p.check_id = c.id
       WHERE c.location_uuid = $1 AND c.trading_day = $2`,
      [tipseeLocationUuid, businessDate]
    );
    const tipsTotal = parseFloat(tipsResult.rows[0]?.tips_total) || 0;

    // 6. Create source snapshot for audit
    const snapshotData = {
      gross_sales: summary.gross_sales,
      net_sales: summary.net_sales,
      total_checks: summary.total_checks,
      total_covers: summary.total_covers,
      total_tax: summary.total_tax,
      total_comps: summary.total_comps,
      total_voids: summary.total_voids,
    };

    await (supabase as any)
      .from('source_day_snapshot')
      .upsert({
        venue_id: venueId,
        business_date: businessDate,
        source_system: 'tipsee',
        source_gross_sales: summary.gross_sales || 0,
        source_net_sales: summary.net_sales || 0,
        source_total_checks: parseInt(summary.total_checks) || 0,
        source_total_covers: parseInt(summary.total_covers) || 0,
        source_total_tax: summary.total_tax || 0,
        source_total_comps: summary.total_comps || 0,
        source_total_voids: summary.total_voids || 0,
        raw_hash: computeHash(snapshotData),
        etl_run_id: etlRunId,
        extracted_at: new Date().toISOString(),
      }, {
        onConflict: 'venue_id,business_date,source_system',
      });
    rowsLoaded++;

    // 7. Upsert venue_day_facts
    await (supabase as any)
      .from('venue_day_facts')
      .upsert({
        venue_id: venueId,
        business_date: businessDate,
        gross_sales: parseFloat(summary.gross_sales) || 0,
        net_sales: parseFloat(summary.net_sales) || 0,
        food_sales: foodSales,
        beverage_sales: beverageSales,
        wine_sales: wineSales,
        liquor_sales: liquorSales,
        beer_sales: beerSales,
        other_sales: otherSales,
        comps_total: parseFloat(summary.total_comps) || 0,
        voids_total: parseFloat(summary.total_voids) || 0,
        taxes_total: parseFloat(summary.total_tax) || 0,
        tips_total: tipsTotal,
        checks_count: parseInt(summary.total_checks) || 0,
        covers_count: parseInt(summary.total_covers) || 0,
        items_sold: totalItemsSold,
        is_complete: true,
        last_synced_at: new Date().toISOString(),
        etl_run_id: etlRunId,
      }, {
        onConflict: 'venue_id,business_date',
      });
    rowsLoaded++;

    // 8. Upsert category_day_facts
    for (const cat of categoryResult.rows) {
      await (supabase as any)
        .from('category_day_facts')
        .upsert({
          venue_id: venueId,
          business_date: businessDate,
          category: cat.category || 'Other',
          gross_sales: parseFloat(cat.gross_sales) || 0,
          net_sales: parseFloat(cat.net_sales) || 0,
          quantity_sold: parseInt(cat.quantity_sold) || 0,
          comps_total: parseFloat(cat.comps_total) || 0,
          voids_total: parseFloat(cat.voids_total) || 0,
          last_synced_at: new Date().toISOString(),
          etl_run_id: etlRunId,
        }, {
          onConflict: 'venue_id,business_date,category',
        });
      rowsLoaded++;
    }

    // 9. Upsert server_day_facts
    for (const server of serverResult.rows) {
      if (!server.employee_name) continue;
      await (supabase as any)
        .from('server_day_facts')
        .upsert({
          venue_id: venueId,
          business_date: businessDate,
          employee_name: server.employee_name,
          employee_role: server.employee_role,
          gross_sales: parseFloat(server.gross_sales) || 0,
          checks_count: parseInt(server.checks_count) || 0,
          covers_count: parseInt(server.covers_count) || 0,
          comps_total: parseFloat(server.comps_total) || 0,
          avg_turn_mins: parseFloat(server.avg_turn_mins) || 0,
          tips_total: 0, // Would need per-server tip query
          last_synced_at: new Date().toISOString(),
          etl_run_id: etlRunId,
        }, {
          onConflict: 'venue_id,business_date,employee_name',
        });
      rowsLoaded++;
    }

    // 10. Upsert item_day_facts
    for (const item of itemResult.rows) {
      if (!item.menu_item_name) continue;
      await (supabase as any)
        .from('item_day_facts')
        .upsert({
          venue_id: venueId,
          business_date: businessDate,
          menu_item_name: item.menu_item_name,
          parent_category: item.parent_category,
          category: item.category,
          quantity_sold: parseFloat(item.quantity_sold) || 0,
          gross_sales: parseFloat(item.gross_sales) || 0,
          net_sales: parseFloat(item.net_sales) || 0,
          comps_total: parseFloat(item.comps_total) || 0,
          voids_total: parseFloat(item.voids_total) || 0,
          last_synced_at: new Date().toISOString(),
          etl_run_id: etlRunId,
        }, {
          onConflict: 'venue_id,business_date,menu_item_name',
        });
      rowsLoaded++;
    }

    // Update ETL run as successful
    await (supabase as any)
      .from('etl_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        rows_extracted: rowsExtracted,
        rows_loaded: rowsLoaded,
      })
      .eq('id', etlRunId);

    return {
      success: true,
      etl_run_id: etlRunId,
      venue_id: venueId,
      business_date: businessDate,
      rows_extracted: rowsExtracted,
      rows_loaded: rowsLoaded,
      duration_ms: Date.now() - startTime,
    };

  } catch (error: any) {
    // Update ETL run as failed
    await (supabase as any)
      .from('etl_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        rows_extracted: rowsExtracted,
        rows_loaded: rowsLoaded,
        error_message: error.message,
      })
      .eq('id', etlRunId);

    return {
      success: false,
      etl_run_id: etlRunId,
      venue_id: venueId,
      business_date: businessDate,
      rows_extracted: rowsExtracted,
      rows_loaded: rowsLoaded,
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Sync all mapped venues for a specific date
 */
export async function syncAllVenuesForDate(businessDate: string): Promise<SyncResult[]> {
  const mappings = await getVenueTipseeMappings();
  const results: SyncResult[] = [];

  for (const mapping of mappings) {
    console.log(`Syncing ${mapping.venue_name} for ${businessDate}...`);
    const result = await syncVenueDay(
      mapping.venue_id,
      mapping.tipsee_location_uuid,
      businessDate
    );
    results.push(result);
    console.log(`  ${result.success ? '✓' : '✗'} ${result.rows_loaded} rows in ${result.duration_ms}ms`);
  }

  return results;
}

/**
 * Sync today's data for all venues (for cron job)
 */
export async function syncToday(): Promise<SyncResult[]> {
  // Use venue's local timezone (LA = Pacific)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return syncAllVenuesForDate(today);
}

/**
 * Sync yesterday's data for all venues (useful for nightly closeout)
 */
export async function syncYesterday(): Promise<SyncResult[]> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return syncAllVenuesForDate(dateStr);
}

/**
 * Backfill historical data for a date range
 */
export async function backfillDateRange(
  startDate: string,
  endDate: string,
  venueId?: string
): Promise<{ total: number; successful: number; failed: number }> {
  const mappings = await getVenueTipseeMappings();
  const filteredMappings = venueId
    ? mappings.filter(m => m.venue_id === venueId)
    : mappings;

  let total = 0;
  let successful = 0;
  let failed = 0;

  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    for (const mapping of filteredMappings) {
      total++;
      const result = await syncVenueDay(
        mapping.venue_id,
        mapping.tipsee_location_uuid,
        dateStr
      );

      if (result.success) {
        successful++;
      } else {
        failed++;
        console.error(`Failed to sync ${mapping.venue_name} for ${dateStr}: ${result.error}`);
      }
    }
  }

  return { total, successful, failed };
}
