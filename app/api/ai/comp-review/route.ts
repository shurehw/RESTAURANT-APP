/**
 * AI Comp Review API
 * Analyzes all comp activity and generates actionable recommendations.
 *
 * POST /api/ai/comp-review — accepts pre-fetched report data (fast path)
 * GET  /api/ai/comp-review?venue_id=xxx&date=yyyy-mm-dd — fetches its own data (legacy)
 *
 * Caching: Results are keyed by sha256(minimal_input). Same data → instant return,
 * no Claude cost. Cache TTL = 24h, stored in Supabase.
 */

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { fetchNightlyReport, fetchCompExceptions } from '@/lib/database/tipsee';
import { reviewComps, type CompReviewInput } from '@/lib/ai/comp-reviewer';
import { getServiceClient } from '@/lib/supabase/service';
import { getCompSettingsForVenue } from '@/lib/database/comp-settings';

// ── In-memory cache for historical comp data (stable per venue+date window) ──
const historicalCache = new Map<string, { data: HistoricalData; ts: number }>();
const pendingFetches = new Map<string, Promise<HistoricalData>>();
const HISTORICAL_TTL_MS = 15 * 60 * 1000; // 15 min
const MAX_CACHE_SIZE = 100;

interface HistoricalData {
  avg_daily_comp_pct: number;
  avg_daily_comp_total: number;
  previous_week_comp_pct: number;
}

// ── POST: fast path with pre-fetched data ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, venue_id: venueId, venue_name: venueName, detailedComps, exceptions, summary } = body;

    if (!date || !venueId || !detailedComps || !summary) {
      return NextResponse.json(
        { error: 'date, venue_id, venue_name, detailedComps, exceptions, and summary are required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI comp review not configured (missing ANTHROPIC_API_KEY)' },
        { status: 503 }
      );
    }

    const supabase = getServiceClient();

    // Build the canonical input that determines the AI review
    const reviewInput = buildReviewInput(
      date,
      venueName || 'Unknown Venue',
      detailedComps,
      exceptions,
      summary,
    );

    // Compute input hash for cache lookup
    const inputHash = computeInputHash(reviewInput);

    // Check cache first
    const cached = await getCachedReview(supabase, venueId, date, inputHash);
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true });
    }

    // Get historical data (in-memory cached, 1 lightweight TipSee query if miss)
    const { data: mapping } = await (supabase as any)
      .from('venue_tipsee_mapping')
      .select('tipsee_location_uuid')
      .eq('venue_id', venueId)
      .maybeSingle();

    reviewInput.historical = mapping?.tipsee_location_uuid
      ? await fetchHistoricalCached(mapping.tipsee_location_uuid, date)
      : { avg_daily_comp_pct: 0, avg_daily_comp_total: 0, previous_week_comp_pct: 0 };

    // Get org-specific comp settings
    const compSettings = await getCompSettingsForVenue(venueId);

    // Run AI review with org settings
    const review = await reviewComps(reviewInput, compSettings ?? undefined);

    // Cache result + save to Control Plane (non-blocking)
    await Promise.all([
      setCachedReview(supabase, venueId, date, inputHash, review),
      saveToControlPlane(venueId, date, venueName || 'Unknown Venue', review),
    ]);

    return NextResponse.json({ success: true, data: review, cached: false });
  } catch (error: any) {
    console.error('AI Comp Review API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── GET: legacy path that fetches its own data ───────────────────────────────

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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI comp review not configured (missing ANTHROPIC_API_KEY)' },
        { status: 503 }
      );
    }

    const supabase = getServiceClient();
    const [mappingResult, venueResult] = await Promise.all([
      (supabase as any)
        .from('venue_tipsee_mapping')
        .select('tipsee_location_uuid')
        .eq('venue_id', venueId)
        .single(),
      (supabase as any)
        .from('venues')
        .select('name')
        .eq('id', venueId)
        .single(),
    ]);

    if (mappingResult.error || !mappingResult.data?.tipsee_location_uuid) {
      return NextResponse.json(
        { error: 'No TipSee mapping found for this venue' },
        { status: 404 }
      );
    }

    const locationUuid = mappingResult.data.tipsee_location_uuid;
    const venueName = venueResult.data?.name || 'Unknown Venue';

    const [reportData, historicalData, compSettings] = await Promise.all([
      fetchNightlyReport(date, locationUuid),
      fetchHistoricalCached(locationUuid, date),
      getCompSettingsForVenue(venueId),
    ]);

    // Fetch exceptions with org settings
    const exceptionsData = await fetchCompExceptions(
      date,
      locationUuid,
      compSettings ? {
        approved_reasons: compSettings.approved_reasons,
        high_value_comp_threshold: compSettings.high_value_comp_threshold,
        high_comp_pct_threshold: compSettings.high_comp_pct_threshold,
        daily_comp_pct_warning: compSettings.daily_comp_pct_warning,
        daily_comp_pct_critical: compSettings.daily_comp_pct_critical,
      } : undefined
    );

    const reviewInput = buildReviewInput(
      date,
      venueName,
      reportData.detailedComps,
      exceptionsData,
      reportData.summary,
    );
    reviewInput.historical = historicalData;

    // Check cache
    const inputHash = computeInputHash(reviewInput);
    const cached = await getCachedReview(supabase, venueId, date, inputHash);
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true });
    }

    const review = await reviewComps(reviewInput, compSettings ?? undefined);

    await Promise.all([
      setCachedReview(supabase, venueId, date, inputHash, review),
      saveToControlPlane(venueId, date, venueName, review),
    ]);

    return NextResponse.json({ success: true, data: review, cached: false });
  } catch (error: any) {
    console.error('AI Comp Review API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function buildReviewInput(
  date: string,
  venueName: string,
  detailedComps: any[],
  exceptions: any,
  summary: any,
): CompReviewInput {
  return {
    date,
    venueName,
    allComps: (detailedComps || []).map((comp: any) => ({
      check_id: comp.check_id,
      table_name: comp.table_name,
      server: comp.server,
      comp_total: comp.comp_total,
      check_total: comp.check_total,
      reason: comp.reason,
      comped_items: (comp.comped_items || []).map((itemStr: any) => {
        if (typeof itemStr === 'string') {
          // Pattern: "Item Name x2 ($12.50)" or "Item Name ($12.50)"
          // First extract amount from end
          const amountMatch = itemStr.match(/\(\$([0-9.]+)\)$/);
          const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

          // Remove amount portion to get name part
          const namePart = amountMatch
            ? itemStr.substring(0, itemStr.lastIndexOf('($')).trim()
            : itemStr;

          // Extract quantity from name (e.g., "Item Name x2")
          const qtyMatch = namePart.match(/^(.+?)\s+x(\d+)$/);
          const name = qtyMatch ? qtyMatch[1].trim() : namePart;
          const quantity = qtyMatch ? parseInt(qtyMatch[2], 10) : 1;

          return { name, quantity, amount };
        }
        // Already parsed object (from GET path)
        return itemStr;
      }),
    })),
    exceptions: exceptions || {
      summary: { date, total_comps: 0, net_sales: 0, comp_pct: 0, comp_pct_status: 'ok', exception_count: 0, critical_count: 0, warning_count: 0 },
      exceptions: [],
    },
    summary: {
      total_comps: summary.total_comps,
      net_sales: summary.net_sales,
      comp_pct: summary.net_sales > 0 ? (summary.total_comps / summary.net_sales) * 100 : 0,
      total_checks: summary.total_checks,
    },
  };
}

/**
 * Compute sha256 of the fields that determine the AI output.
 * Excludes historical data (context-only, doesn't change comp assessment).
 */
function computeInputHash(input: CompReviewInput): string {
  const hashPayload = {
    date: input.date,
    comps: input.allComps.map(c => ({
      id: c.check_id,
      amount: c.comp_total,
      reason: c.reason,
    })),
    total_comps: input.summary.total_comps,
    net_sales: input.summary.net_sales,
    exception_count: input.exceptions?.exceptions?.length || 0,
  };
  return createHash('sha256').update(JSON.stringify(hashPayload)).digest('hex');
}

async function getCachedReview(supabase: any, venueId: string, date: string, inputHash: string) {
  try {
    const { data } = await (supabase as any)
      .from('ai_comp_review_cache')
      .select('result')
      .eq('venue_id', venueId)
      .eq('business_date', date)
      .eq('input_hash', inputHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    return data?.result || null;
  } catch {
    return null; // Cache miss on error — don't block
  }
}

async function setCachedReview(supabase: any, venueId: string, date: string, inputHash: string, result: any) {
  try {
    await (supabase as any)
      .from('ai_comp_review_cache')
      .upsert({
        venue_id: venueId,
        business_date: date,
        input_hash: inputHash,
        result,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'venue_id,business_date,input_hash' });
  } catch (err) {
    console.error('Failed to cache AI review:', err);
  }
}

async function saveToControlPlane(venueId: string, date: string, venueName: string, review: any) {
  try {
    const { saveCompReviewActions } = await import('@/lib/database/control-plane');
    const actionResult = await saveCompReviewActions(venueId, date, venueName, review.recommendations);
    if (!actionResult.success) {
      console.error('Failed to save some actions:', actionResult.errors);
    }
  } catch (err) {
    console.error('Error saving actions to Control Plane:', err);
  }
}

/**
 * Fetch historical comp data with in-memory TTL cache.
 * Stable per venue+date window — no need to re-query TipSee every page load.
 * Prevents duplicate fetches via pending promise tracking.
 */
async function fetchHistoricalCached(locationUuid: string, currentDate: string): Promise<HistoricalData> {
  const cacheKey = `${locationUuid}:${currentDate}`;

  // Check cache first
  const entry = historicalCache.get(cacheKey);
  if (entry && Date.now() - entry.ts < HISTORICAL_TTL_MS) {
    return entry.data;
  }

  // Check if fetch is already in progress (prevent duplicate queries)
  const pending = pendingFetches.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Start new fetch and track it
  const fetchPromise = fetchHistoricalFromTipsee(locationUuid, currentDate)
    .then((data) => {
      historicalCache.set(cacheKey, { data, ts: Date.now() });
      pendingFetches.delete(cacheKey);

      // Evict oldest entries if cache is too large (LRU-style)
      if (historicalCache.size > MAX_CACHE_SIZE) {
        const now = Date.now();
        // First try to evict expired entries
        for (const [k, v] of historicalCache) {
          if (now - v.ts > HISTORICAL_TTL_MS) {
            historicalCache.delete(k);
          }
        }

        // If still over limit, evict oldest entries
        if (historicalCache.size > MAX_CACHE_SIZE) {
          const sorted = Array.from(historicalCache.entries())
            .sort((a, b) => a[1].ts - b[1].ts);
          const toDelete = sorted.slice(0, historicalCache.size - MAX_CACHE_SIZE);
          toDelete.forEach(([k]) => historicalCache.delete(k));
        }
      }

      return data;
    })
    .catch((err) => {
      pendingFetches.delete(cacheKey);
      throw err;
    });

  pendingFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

async function fetchHistoricalFromTipsee(locationUuid: string, currentDate: string): Promise<HistoricalData> {
  const { getTipseePool } = await import('@/lib/database/tipsee');
  const pool = getTipseePool();

  try {
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

    return {
      avg_daily_comp_pct: avgCompPct,
      avg_daily_comp_total: avgCompTotal,
      previous_week_comp_pct: totalRevenue > 0 ? (totalComps / totalRevenue) * 100 : 0,
    };
  } catch (error) {
    console.error('Error fetching historical comp data:', error);
    return { avg_daily_comp_pct: 0, avg_daily_comp_total: 0, previous_week_comp_pct: 0 };
  }
}
