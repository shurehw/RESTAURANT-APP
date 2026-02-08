/**
 * Nightly Report API
 * Fetches TipSee data for nightly reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchNightlyReport, fetchTipseeLocations } from '@/lib/database/tipsee';

// Default location (The Nice Guy)
const DEFAULT_LOCATION = 'aeb1790a-1ce9-4d6c-b1bc-7ef618294dc4';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');
  const location = searchParams.get('location') || DEFAULT_LOCATION;
  const action = searchParams.get('action');

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

    const report = await fetchNightlyReport(date, location);
    return NextResponse.json(report);
  } catch (error: any) {
    console.error('Nightly report API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch report' },
      { status: 500 }
    );
  }
}
