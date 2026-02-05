/**
 * Entertainment Schedule API
 * Returns entertainment schedules for venues
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllVenueSchedules,
  getScheduleForVenue,
  getScheduleByVenueName,
  VENUE_ENTERTAINMENT_MAP,
} from '@/lib/entertainment/data';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const venueId = searchParams.get('venue_id');
  const venueName = searchParams.get('venue_name');
  const action = searchParams.get('action');

  try {
    // Get venue mapping
    if (action === 'venues') {
      return NextResponse.json({
        venues: Object.entries(VENUE_ENTERTAINMENT_MAP).map(([name, id]) => ({
          name,
          id,
        })),
      });
    }

    // Get all schedules
    if (action === 'all') {
      return NextResponse.json(getAllVenueSchedules());
    }

    // Get schedule by venue ID
    if (venueId) {
      const schedule = getScheduleForVenue(venueId);
      if (!schedule) {
        return NextResponse.json(
          { error: 'Venue not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(schedule);
    }

    // Get schedule by venue name
    if (venueName) {
      const schedule = getScheduleByVenueName(venueName);
      if (!schedule) {
        return NextResponse.json(
          { error: 'Venue not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(schedule);
    }

    // Default: return all
    return NextResponse.json(getAllVenueSchedules());
  } catch (error: any) {
    console.error('Entertainment API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch entertainment data' },
      { status: 500 }
    );
  }
}
