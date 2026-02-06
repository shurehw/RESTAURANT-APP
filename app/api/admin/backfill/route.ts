/**
 * Admin API: Backfill Fact Tables
 *
 * POST /api/admin/backfill
 *   ?startDate=YYYY-MM-DD  (defaults to 90 days ago)
 *   ?endDate=YYYY-MM-DD    (defaults to yesterday)
 *   ?venueId=xxx           (optional, backfill specific venue)
 *
 * This endpoint triggers a backfill of venue_day_facts and related tables
 * from TipSee data to enable proper WTD/PTD calculations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backfillDateRange, getVenueTipseeMappings } from '@/lib/etl/tipsee-sync';

export const maxDuration = 300; // 5 minute timeout for edge function

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venueId') || undefined;

    // Calculate date range
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const defaultStartDate = new Date(yesterday);
    defaultStartDate.setDate(defaultStartDate.getDate() - 89); // 90 days total

    const startDate = searchParams.get('startDate') || defaultStartDate.toISOString().split('T')[0];
    const endDate = searchParams.get('endDate') || yesterday.toISOString().split('T')[0];

    // Get venue info for response
    const mappings = await getVenueTipseeMappings();
    const targetVenues = venueId
      ? mappings.filter(m => m.venue_id === venueId)
      : mappings;

    if (targetVenues.length === 0) {
      return NextResponse.json(
        { error: 'No venue mappings found' },
        { status: 404 }
      );
    }

    // Calculate totals
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const totalDays = Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;

    console.log(`[Backfill] Starting: ${startDate} → ${endDate}`);
    console.log(`[Backfill] Venues: ${targetVenues.map(v => v.venue_name).join(', ')}`);
    console.log(`[Backfill] Total days: ${totalDays}, Total syncs: ${totalDays * targetVenues.length}`);

    const startTime = Date.now();

    // Run the backfill
    const result = await backfillDateRange(startDate, endDate, venueId);

    const duration = Date.now() - startTime;

    console.log(`[Backfill] Complete: ${result.successful}/${result.total} successful in ${duration}ms`);

    return NextResponse.json({
      success: result.failed === 0,
      dateRange: { start: startDate, end: endDate },
      venues: targetVenues.map(v => v.venue_name),
      results: {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
      },
      duration_ms: duration,
    });

  } catch (error) {
    console.error('[Backfill] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check status or get help
export async function GET() {
  const mappings = await getVenueTipseeMappings();

  return NextResponse.json({
    description: 'Backfill fact tables from TipSee data',
    method: 'POST',
    params: {
      startDate: 'YYYY-MM-DD (defaults to 90 days ago)',
      endDate: 'YYYY-MM-DD (defaults to yesterday)',
      venueId: 'UUID (optional, defaults to all venues)',
    },
    venues: mappings.map(v => ({
      id: v.venue_id,
      name: v.venue_name,
    })),
    example: 'POST /api/admin/backfill?startDate=2025-12-29&endDate=2026-02-04',
  });
}
