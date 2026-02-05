/**
 * ETL Sync API
 * Triggers TipSee data synchronization to our fact tables
 *
 * GET /api/etl/sync?date=2024-01-15           - Sync specific date for all venues
 * GET /api/etl/sync?date=2024-01-15&venue_id=xxx - Sync specific date and venue
 * GET /api/etl/sync?action=today              - Sync today's data
 * GET /api/etl/sync?action=yesterday          - Sync yesterday's data
 * POST /api/etl/sync (body: { startDate, endDate, venueId? }) - Backfill range
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  syncVenueDay,
  syncAllVenuesForDate,
  syncToday,
  syncYesterday,
  backfillDateRange,
  getVenueTipseeMappings,
} from '@/lib/etl/tipsee-sync';
import { getServiceClient } from '@/lib/supabase/service';

// Secret for cron job authentication (set in env vars)
const CRON_SECRET = process.env.CRON_SECRET || process.env.ETL_CRON_SECRET;

function validateCronAuth(request: NextRequest): boolean {
  // Allow if no secret is configured (development)
  if (!CRON_SECRET) return true;

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret === CRON_SECRET) return true;

  return false;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  const date = searchParams.get('date');
  const venueId = searchParams.get('venue_id');

  // Validate authentication for cron jobs
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Handle action-based requests
    if (action === 'today') {
      console.log('Starting sync for today...');
      const results = await syncToday();
      return NextResponse.json({
        success: true,
        action: 'today',
        results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      });
    }

    if (action === 'yesterday') {
      console.log('Starting sync for yesterday...');
      const results = await syncYesterday();
      return NextResponse.json({
        success: true,
        action: 'yesterday',
        results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      });
    }

    if (action === 'mappings') {
      const mappings = await getVenueTipseeMappings();
      return NextResponse.json({ mappings });
    }

    // Handle date-specific sync
    if (date) {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 }
        );
      }

      if (venueId) {
        // Sync specific venue
        const mappings = await getVenueTipseeMappings();
        const mapping = mappings.find(m => m.venue_id === venueId);

        if (!mapping) {
          return NextResponse.json(
            { error: 'Venue not found or not mapped to TipSee' },
            { status: 404 }
          );
        }

        console.log(`Starting sync for ${mapping.venue_name} on ${date}...`);
        const result = await syncVenueDay(venueId, mapping.tipsee_location_uuid, date);
        return NextResponse.json({
          success: result.success,
          result,
        });
      }

      // Sync all venues for date
      console.log(`Starting sync for all venues on ${date}...`);
      const results = await syncAllVenuesForDate(date);
      return NextResponse.json({
        success: true,
        date,
        results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      });
    }

    // No action or date specified - return help
    return NextResponse.json({
      error: 'Missing required parameters',
      usage: {
        'GET ?action=today': 'Sync today\'s data for all venues',
        'GET ?action=yesterday': 'Sync yesterday\'s data for all venues',
        'GET ?date=YYYY-MM-DD': 'Sync specific date for all venues',
        'GET ?date=YYYY-MM-DD&venue_id=xxx': 'Sync specific date and venue',
        'GET ?action=mappings': 'List venue-TipSee mappings',
        'POST { startDate, endDate, venueId? }': 'Backfill date range',
      },
    }, { status: 400 });

  } catch (error: any) {
    console.error('ETL sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Validate authentication
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { startDate, endDate, venueId } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Validate date formats
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Validate date range (max 90 days to prevent abuse)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 90) {
      return NextResponse.json(
        { error: 'Date range cannot exceed 90 days' },
        { status: 400 }
      );
    }

    if (daysDiff < 0) {
      return NextResponse.json(
        { error: 'endDate must be after startDate' },
        { status: 400 }
      );
    }

    console.log(`Starting backfill from ${startDate} to ${endDate}...`);
    const result = await backfillDateRange(startDate, endDate, venueId);

    return NextResponse.json({
      success: result.failed === 0,
      ...result,
    });

  } catch (error: any) {
    console.error('ETL backfill error:', error);
    return NextResponse.json(
      { error: error.message || 'Backfill failed' },
      { status: 500 }
    );
  }
}
