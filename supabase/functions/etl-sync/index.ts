/**
 * Supabase Edge Function: ETL Sync
 * Extracts data from TipSee POS and loads into our analytics fact tables
 *
 * Trigger via:
 * - pg_cron (scheduled)
 * - HTTP POST with auth header
 *
 * Query params:
 *   ?action=today|yesterday
 *   ?date=YYYY-MM-DD
 *   ?venue_id=xxx (optional)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

// Types
interface VenueTipseeMapping {
  venue_id: string;
  tipsee_location_uuid: string;
  venue_name: string;
}

interface SyncResult {
  success: boolean;
  etl_run_id: string;
  venue_id: string;
  business_date: string;
  rows_extracted: number;
  rows_loaded: number;
  duration_ms: number;
  error?: string;
}

// Category mapping
const CATEGORY_MAPPING: Record<string, string> = {
  'Food': 'food', 'FOOD': 'food', 'Entree': 'food', 'Appetizer': 'food',
  'Dessert': 'food', 'Side': 'food', 'Salad': 'food', 'Soup': 'food',
  'Wine': 'wine', 'WINE': 'wine', 'Wine by Glass': 'wine', 'Wine by Bottle': 'wine',
  'BTG': 'wine', 'BTB': 'wine',
  'Liquor': 'liquor', 'LIQUOR': 'liquor', 'Spirits': 'liquor',
  'Cocktail': 'liquor', 'Cocktails': 'liquor',
  'Beer': 'beer', 'BEER': 'beer', 'Beers': 'beer', 'Draft': 'beer',
  'Beverage': 'beverage', 'BEVERAGE': 'beverage', 'Drinks': 'beverage',
};

function getCategoryType(category: string | null): string {
  if (!category) return 'other';
  return CATEGORY_MAPPING[category] || 'other';
}

async function computeHash(data: Record<string, unknown>): Promise<string> {
  const str = JSON.stringify(data, Object.keys(data).sort());
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

// Get TipSee connection
function getTipseeClient(): Client {
  return new Client({
    hostname: Deno.env.get('TIPSEE_DB_HOST') || 'TIPSEE_HOST_REDACTED',
    port: parseInt(Deno.env.get('TIPSEE_DB_PORT') || '5432'),
    user: Deno.env.get('TIPSEE_DB_USER') || 'TIPSEE_USERNAME_REDACTED',
    password: Deno.env.get('TIPSEE_DB_PASSWORD') || 'TIPSEE_PASSWORD_REDACTED',
    database: Deno.env.get('TIPSEE_DB_NAME') || 'postgres',
    tls: { enabled: true, enforce: false },
  });
}

// Get Supabase service client
function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

// Get venue mappings
async function getVenueMappings(supabase: ReturnType<typeof createClient>): Promise<VenueTipseeMapping[]> {
  const { data, error } = await supabase
    .from('venue_tipsee_mapping')
    .select(`venue_id, tipsee_location_uuid, venues!inner(name)`)
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

// Sync a single venue for a date
async function syncVenueDay(
  tipsee: Client,
  supabase: ReturnType<typeof createClient>,
  venueId: string,
  tipseeLocationUuid: string,
  businessDate: string
): Promise<SyncResult> {
  const startTime = Date.now();
  let rowsExtracted = 0;
  let rowsLoaded = 0;

  // Create ETL run record
  const { data: etlRun, error: etlError } = await supabase
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

  const etlRunId = etlRun.id;

  try {
    // 1. Extract summary
    const summaryResult = await tipsee.queryObject<{
      trading_day: string;
      total_checks: bigint;
      total_covers: bigint;
      gross_sales: number;
      net_sales: number;
      total_tax: number;
      total_comps: number;
      total_voids: number;
    }>`
      SELECT
        trading_day,
        COUNT(*) as total_checks,
        SUM(guest_count) as total_covers,
        SUM(revenue_total) as gross_sales,
        SUM(sub_total) as net_sales,
        SUM(tax_total) as total_tax,
        SUM(comp_total) as total_comps,
        SUM(void_total) as total_voids
      FROM public.tipsee_checks
      WHERE location_uuid = ${tipseeLocationUuid} AND trading_day = ${businessDate}
      GROUP BY trading_day
    `;

    const summary = summaryResult.rows[0] || {
      total_checks: 0n, total_covers: 0n, gross_sales: 0, net_sales: 0,
      total_tax: 0, total_comps: 0, total_voids: 0
    };
    rowsExtracted++;

    // 2. Extract categories
    const categoryResult = await tipsee.queryObject<{
      category: string;
      gross_sales: number;
      quantity_sold: bigint;
      comps_total: number;
      voids_total: number;
    }>`
      SELECT
        COALESCE(parent_category, 'Other') as category,
        SUM(price * quantity) as gross_sales,
        SUM(quantity) as quantity_sold,
        SUM(comp_total) as comps_total,
        SUM(void_value) as voids_total
      FROM public.tipsee_check_items
      WHERE location_uuid = ${tipseeLocationUuid} AND trading_day = ${businessDate}
      GROUP BY parent_category
    `;
    rowsExtracted += categoryResult.rows.length;

    // Calculate category breakdowns
    let foodSales = 0, beverageSales = 0, wineSales = 0, liquorSales = 0, beerSales = 0, otherSales = 0;
    let totalItemsSold = 0;

    for (const row of categoryResult.rows) {
      const categoryType = getCategoryType(row.category);
      const sales = Number(row.gross_sales) || 0;
      totalItemsSold += Number(row.quantity_sold) || 0;

      switch (categoryType) {
        case 'food': foodSales += sales; break;
        case 'wine': wineSales += sales; beverageSales += sales; break;
        case 'liquor': liquorSales += sales; beverageSales += sales; break;
        case 'beer': beerSales += sales; beverageSales += sales; break;
        case 'beverage': beverageSales += sales; break;
        default: otherSales += sales;
      }
    }

    // 3. Extract server data
    const serverResult = await tipsee.queryObject<{
      employee_name: string;
      employee_role: string | null;
      checks_count: bigint;
      covers_count: bigint;
      gross_sales: number;
      comps_total: number;
      avg_turn_mins: number;
    }>`
      SELECT
        employee_name,
        employee_role_name as employee_role,
        COUNT(*) as checks_count,
        SUM(guest_count) as covers_count,
        SUM(revenue_total) as gross_sales,
        SUM(comp_total) as comps_total,
        ROUND(AVG(CASE WHEN close_time > open_time
          THEN EXTRACT(EPOCH FROM (close_time - open_time))/60 END)::numeric, 0) as avg_turn_mins
      FROM public.tipsee_checks
      WHERE location_uuid = ${tipseeLocationUuid} AND trading_day = ${businessDate}
      GROUP BY employee_name, employee_role_name
    `;
    rowsExtracted += serverResult.rows.length;

    // 4. Extract items (top 100)
    const itemResult = await tipsee.queryObject<{
      menu_item_name: string;
      parent_category: string | null;
      category: string | null;
      quantity_sold: number;
      gross_sales: number;
      comps_total: number;
      voids_total: number;
    }>`
      SELECT
        name as menu_item_name,
        parent_category,
        category,
        SUM(quantity) as quantity_sold,
        SUM(price * quantity) as gross_sales,
        SUM(comp_total) as comps_total,
        SUM(void_value) as voids_total
      FROM public.tipsee_check_items
      WHERE location_uuid = ${tipseeLocationUuid} AND trading_day = ${businessDate}
      GROUP BY name, parent_category, category
      ORDER BY gross_sales DESC
      LIMIT 100
    `;
    rowsExtracted += itemResult.rows.length;

    // 5. Extract tips
    const tipsResult = await tipsee.queryObject<{ tips_total: number }>`
      SELECT COALESCE(SUM(tip_amount), 0) as tips_total
      FROM public.tipsee_payments p
      JOIN public.tipsee_checks c ON p.check_id = c.id
      WHERE c.location_uuid = ${tipseeLocationUuid} AND c.trading_day = ${businessDate}
    `;
    const tipsTotal = Number(tipsResult.rows[0]?.tips_total) || 0;

    // 6. Create source snapshot
    const snapshotData = {
      gross_sales: summary.gross_sales,
      net_sales: summary.net_sales,
      total_checks: Number(summary.total_checks),
      total_covers: Number(summary.total_covers),
    };

    await supabase.from('source_day_snapshot').upsert({
      venue_id: venueId,
      business_date: businessDate,
      source_system: 'tipsee',
      source_gross_sales: Number(summary.gross_sales) || 0,
      source_net_sales: Number(summary.net_sales) || 0,
      source_total_checks: Number(summary.total_checks) || 0,
      source_total_covers: Number(summary.total_covers) || 0,
      source_total_tax: Number(summary.total_tax) || 0,
      source_total_comps: Number(summary.total_comps) || 0,
      source_total_voids: Number(summary.total_voids) || 0,
      raw_hash: await computeHash(snapshotData),
      etl_run_id: etlRunId,
      extracted_at: new Date().toISOString(),
    }, { onConflict: 'venue_id,business_date,source_system' });
    rowsLoaded++;

    // 7. Upsert venue_day_facts
    await supabase.from('venue_day_facts').upsert({
      venue_id: venueId,
      business_date: businessDate,
      gross_sales: Number(summary.gross_sales) || 0,
      net_sales: Number(summary.net_sales) || 0,
      food_sales: foodSales,
      beverage_sales: beverageSales,
      wine_sales: wineSales,
      liquor_sales: liquorSales,
      beer_sales: beerSales,
      other_sales: otherSales,
      comps_total: Number(summary.total_comps) || 0,
      voids_total: Number(summary.total_voids) || 0,
      taxes_total: Number(summary.total_tax) || 0,
      tips_total: tipsTotal,
      checks_count: Number(summary.total_checks) || 0,
      covers_count: Number(summary.total_covers) || 0,
      items_sold: totalItemsSold,
      is_complete: true,
      last_synced_at: new Date().toISOString(),
      etl_run_id: etlRunId,
    }, { onConflict: 'venue_id,business_date' });
    rowsLoaded++;

    // 8. Upsert category_day_facts
    for (const cat of categoryResult.rows) {
      await supabase.from('category_day_facts').upsert({
        venue_id: venueId,
        business_date: businessDate,
        category: cat.category || 'Other',
        gross_sales: Number(cat.gross_sales) || 0,
        net_sales: Number(cat.gross_sales) || 0,
        quantity_sold: Number(cat.quantity_sold) || 0,
        comps_total: Number(cat.comps_total) || 0,
        voids_total: Number(cat.voids_total) || 0,
        last_synced_at: new Date().toISOString(),
        etl_run_id: etlRunId,
      }, { onConflict: 'venue_id,business_date,category' });
      rowsLoaded++;
    }

    // 9. Upsert server_day_facts
    for (const server of serverResult.rows) {
      if (!server.employee_name) continue;
      await supabase.from('server_day_facts').upsert({
        venue_id: venueId,
        business_date: businessDate,
        employee_name: server.employee_name,
        employee_role: server.employee_role,
        gross_sales: Number(server.gross_sales) || 0,
        checks_count: Number(server.checks_count) || 0,
        covers_count: Number(server.covers_count) || 0,
        comps_total: Number(server.comps_total) || 0,
        avg_turn_mins: Number(server.avg_turn_mins) || 0,
        tips_total: 0,
        last_synced_at: new Date().toISOString(),
        etl_run_id: etlRunId,
      }, { onConflict: 'venue_id,business_date,employee_name' });
      rowsLoaded++;
    }

    // 10. Upsert item_day_facts
    for (const item of itemResult.rows) {
      if (!item.menu_item_name) continue;
      await supabase.from('item_day_facts').upsert({
        venue_id: venueId,
        business_date: businessDate,
        menu_item_name: item.menu_item_name,
        parent_category: item.parent_category,
        category: item.category,
        quantity_sold: Number(item.quantity_sold) || 0,
        gross_sales: Number(item.gross_sales) || 0,
        net_sales: Number(item.gross_sales) || 0,
        comps_total: Number(item.comps_total) || 0,
        voids_total: Number(item.voids_total) || 0,
        last_synced_at: new Date().toISOString(),
        etl_run_id: etlRunId,
      }, { onConflict: 'venue_id,business_date,menu_item_name' });
      rowsLoaded++;
    }

    // 11. Extract and upsert labor_day_facts
    // Primary: new_tipsee_punches (all venues, most complete)
    // Fallback: punches (has trading_day + hourly_wage built in, stale for LA venues)
    const laborSummaryResult = await tipsee.queryObject<{
      punch_count: bigint;
      employee_count: bigint;
      total_hours: number;
      labor_cost: number;
    }>`
      SELECT
        COUNT(*) as punch_count,
        COUNT(DISTINCT p.user_id) as employee_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600), 0) as total_hours,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600 *
          COALESCE(w.wage_cents, 0) / 100
        ), 0) as labor_cost
      FROM public.new_tipsee_punches p
      LEFT JOIN LATERAL (
        SELECT wage_cents FROM public.new_tipsee_7shifts_users_wages
        WHERE user_id = p.user_id
          AND effective_date <= p.clocked_in::date
        ORDER BY effective_date DESC
        LIMIT 1
      ) w ON true
      WHERE p.location_uuid = ${tipseeLocationUuid}
        AND p.clocked_in::date = ${businessDate}::date
        AND p.clocked_out IS NOT NULL
        AND p.is_deleted IS NOT TRUE
    `;
    rowsExtracted++;

    let laborRow = laborSummaryResult.rows[0];

    // Fallback: old punches table
    if (!laborRow || Number(laborRow.punch_count) === 0) {
      const fallbackResult = await tipsee.queryObject<{
        punch_count: bigint;
        employee_count: bigint;
        total_hours: number;
        labor_cost: number;
      }>`
        SELECT
          COUNT(*) as punch_count,
          COUNT(DISTINCT user_id) as employee_count,
          COALESCE(SUM(total_hours), 0) as total_hours,
          COALESCE(SUM(total_hours * hourly_wage / 100), 0) as labor_cost
        FROM public.punches
        WHERE location_uuid = ${tipseeLocationUuid}
          AND trading_day = ${businessDate}
          AND deleted IS NOT TRUE
          AND clocked_out IS NOT NULL
      `;
      laborRow = fallbackResult.rows[0];
    }

    if (laborRow && Number(laborRow.punch_count) > 0) {
      // Calculate OT hours
      const otResult = await tipsee.queryObject<{
        user_id: string;
        daily_hours: number;
      }>`
        SELECT user_id, SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) as daily_hours
        FROM public.new_tipsee_punches
        WHERE location_uuid = ${tipseeLocationUuid}
          AND clocked_in::date = ${businessDate}::date
          AND clocked_out IS NOT NULL
          AND is_deleted IS NOT TRUE
        GROUP BY user_id
        HAVING SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) > 8
      `;

      const otHours = otResult.rows.reduce((sum, r) =>
        sum + Math.max(0, Number(r.daily_hours) - 8), 0);

      await supabase.from('labor_day_facts').upsert({
        venue_id: venueId,
        business_date: businessDate,
        total_hours: Number(laborRow.total_hours) || 0,
        ot_hours: otHours,
        labor_cost: Number(laborRow.labor_cost) || 0,
        punch_count: Number(laborRow.punch_count) || 0,
        employee_count: Number(laborRow.employee_count) || 0,
        net_sales: Number(summary.net_sales) || 0,
        covers: Number(summary.total_covers) || 0,
        last_synced_at: new Date().toISOString(),
        etl_run_id: etlRunId,
      }, { onConflict: 'venue_id,business_date' });
      rowsLoaded++;
    }

    // Mark ETL run successful
    await supabase.from('etl_runs').update({
      status: 'success',
      finished_at: new Date().toISOString(),
      rows_extracted: rowsExtracted,
      rows_loaded: rowsLoaded,
    }).eq('id', etlRunId);

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
    await supabase.from('etl_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      rows_extracted: rowsExtracted,
      rows_loaded: rowsLoaded,
      error_message: error.message,
    }).eq('id', etlRunId);

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

// Main handler
serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const date = url.searchParams.get('date');
    const venueId = url.searchParams.get('venue_id');

    // Get target date
    let targetDate: string;
    if (action === 'today') {
      targetDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    } else if (action === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    } else if (date) {
      targetDate = date;
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing action or date parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`ETL sync starting for ${targetDate}...`);

    // Initialize clients
    const supabase = getSupabaseClient();
    const tipsee = getTipseeClient();
    await tipsee.connect();

    try {
      // Get venue mappings
      const mappings = await getVenueMappings(supabase);
      const filteredMappings = venueId
        ? mappings.filter(m => m.venue_id === venueId)
        : mappings;

      if (filteredMappings.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No venue mappings found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sync each venue
      const results: SyncResult[] = [];
      for (const mapping of filteredMappings) {
        console.log(`Syncing ${mapping.venue_name}...`);
        const result = await syncVenueDay(
          tipsee,
          supabase,
          mapping.venue_id,
          mapping.tipsee_location_uuid,
          targetDate
        );
        results.push(result);
        console.log(`  ${result.success ? '✓' : '✗'} ${result.rows_loaded} rows`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          date: targetDate,
          results,
          summary: {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } finally {
      await tipsee.end();
    }

  } catch (error: any) {
    console.error('ETL sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
