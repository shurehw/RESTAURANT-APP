/**
 * Sales Pace Polling Endpoint
 *
 * GET /api/sales/poll — Called by an external scheduler (QStash, cron-job.org, etc.)
 *
 * For each active venue with sales pace monitoring enabled:
 * 1. Check if within service hours (skip if closed)
 * 2. Fetch current-day running totals from TipSee
 * 3. Store snapshot in sales_snapshots table
 *
 * Auth: x-cron-secret header or Bearer token (matches camera poll pattern)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveSalesPaceVenues,
  getSalesPaceSettings,
  storeSalesSnapshot,
  getTipseeMappingForVenue,
} from '@/lib/database/sales-pace';
import { fetchIntraDaySummary } from '@/lib/database/tipsee';

const CRON_SECRET = process.env.CRON_SECRET || process.env.CV_CRON_SECRET;

function validateCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) return true; // dev mode

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret === CRON_SECRET) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetVenueId = request.nextUrl.searchParams.get('venue_id');

  try {
    const venues = targetVenueId
      ? [{ venue_id: targetVenueId, polling_interval_seconds: 300 }]
      : await getActiveSalesPaceVenues();

    if (venues.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active venues with sales pace monitoring',
        venues_processed: 0,
      });
    }

    const results = await Promise.allSettled(
      venues.map((v) => processVenue(v.venue_id))
    );

    const summary = results.map((r, i) => ({
      venue_id: venues[i].venue_id,
      status: r.status,
      ...(r.status === 'fulfilled' ? r.value : { error: (r as any).reason?.message }),
    }));

    return NextResponse.json({
      success: true,
      venues_processed: venues.length,
      results: summary,
    });
  } catch (error: any) {
    console.error('Sales poll error:', error);
    return NextResponse.json(
      { error: error.message || 'Poll failed' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PER-VENUE PROCESSING
// ══════════════════════════════════════════════════════════════════════════

async function processVenue(venueId: string): Promise<{
  snapshot_stored: boolean;
  net_sales: number;
  covers: number;
  checks: number;
  skipped_reason?: string;
}> {
  const settings = await getSalesPaceSettings(venueId);

  // Check service hours
  const startHour = settings?.service_start_hour ?? 11;
  const endHour = settings?.service_end_hour ?? 3;
  if (!isWithinServiceHours(startHour, endHour)) {
    return { snapshot_stored: false, net_sales: 0, covers: 0, checks: 0, skipped_reason: 'outside_service_hours' };
  }

  // Get TipSee mapping
  const locationUuids = await getTipseeMappingForVenue(venueId);
  if (locationUuids.length === 0) {
    return { snapshot_stored: false, net_sales: 0, covers: 0, checks: 0, skipped_reason: 'no_tipsee_mapping' };
  }

  // Determine business date (before 5 AM = previous day)
  const businessDate = getBusinessDate();

  // Fetch running totals from TipSee
  const summary = await fetchIntraDaySummary(locationUuids, businessDate);

  // Store snapshot
  const now = new Date().toISOString();
  await storeSalesSnapshot({
    venue_id: venueId,
    business_date: businessDate,
    snapshot_at: now,
    gross_sales: summary.gross_sales,
    net_sales: summary.net_sales,
    food_sales: summary.food_sales,
    beverage_sales: summary.beverage_sales,
    checks_count: summary.total_checks,
    covers_count: summary.total_covers,
    comps_total: summary.comps_total,
    voids_total: summary.voids_total,
  });

  return {
    snapshot_stored: true,
    net_sales: summary.net_sales,
    covers: summary.total_covers,
    checks: summary.total_checks,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Check if current time is within service hours.
 * Handles overnight ranges (e.g., 11 PM to 3 AM = start=23, end=3).
 */
function isWithinServiceHours(startHour: number, endHour: number): boolean {
  const now = new Date();
  const currentHour = now.getHours();

  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour < endHour;
  } else {
    // Overnight range (e.g., 17 to 3)
    return currentHour >= startHour || currentHour < endHour;
  }
}

/**
 * Restaurant business date: before 5 AM belongs to the previous day.
 */
function getBusinessDate(): string {
  const now = new Date();
  if (now.getHours() < 5) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().split('T')[0];
}
