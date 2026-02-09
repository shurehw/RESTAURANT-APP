/**
 * Nightly Report API
 * Fetches TipSee data for nightly reports
 *
 * PERFORMANCE OPTIMIZATION:
 * - First checks Supabase cache (synced nightly at 3am)
 * - Falls back to live TipSee query if not cached
 * - Cache hit: <1 second | Cache miss: 10-60 seconds
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchNightlyReport, fetchTipseeLocations } from '@/lib/database/tipsee';
import { getServiceClient } from '@/lib/supabase/service';

// Default location (The Nice Guy)
const DEFAULT_LOCATION = 'aeb1790a-1ce9-4d6c-b1bc-7ef618294dc4';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');
  const location = searchParams.get('location') || DEFAULT_LOCATION;
  const action = searchParams.get('action');
  const forceLive = searchParams.get('force_live') === 'true'; // For debugging

  try {
    // Handle locations list request
    if (action === 'locations') {
      const locations = await fetchTipseeLocations();
      return NextResponse.json(locations);
    }

    // Handle report request
    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter is required' },
        { status: 400 }
      );
    }

    // ── Performance Optimization: Check Cache First ──
    if (!forceLive) {
      const cached = await getCachedReport(location, date);
      if (cached) {
        console.log(`[nightly] Cache HIT for ${location.substring(0, 8)} ${date}`);
        return NextResponse.json({
          ...cached,
          _cached: true,
          _synced_at: cached._synced_at,
        });
      }
      console.log(`[nightly] Cache MISS for ${location.substring(0, 8)} ${date} - fetching live`);
    }

    // Fallback to live TipSee query
    const report = await fetchNightlyReport(date, location);
    return NextResponse.json({
      ...report,
      _cached: false,
    });
  } catch (error: any) {
    console.error('Nightly report API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch report' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Check cache for report data
 * Returns cached report if available, null otherwise
 */
async function getCachedReport(locationUuid: string, businessDate: string): Promise<any | null> {
  try {
    const supabase = getServiceClient();

    // Look up venue_id from TipSee location UUID
    const { data: mapping } = await (supabase as any)
      .from('venue_tipsee_mappings')
      .select('venue_id')
      .eq('tipsee_location_uuid', locationUuid)
      .eq('is_active', true)
      .maybeSingle();

    if (!mapping?.venue_id) {
      return null; // No mapping found, skip cache
    }

    // Check cache
    const { data: cached } = await (supabase as any)
      .from('tipsee_nightly_cache')
      .select('report_data, synced_at')
      .eq('venue_id', mapping.venue_id)
      .eq('business_date', businessDate)
      .maybeSingle();

    if (cached?.report_data) {
      return {
        ...cached.report_data,
        _synced_at: cached.synced_at,
      };
    }

    return null;
  } catch (error) {
    console.error('Cache lookup error:', error);
    return null; // On error, skip cache and fetch live
  }
}
