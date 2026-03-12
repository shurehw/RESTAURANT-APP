import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getIngredientDemandForecast,
  getIngredientNeeds,
  refreshItemMixRatios,
} from '@/lib/database/ingredient-forecast';

/**
 * GET /api/inventory/forecast
 * Get ingredient demand forecast or net needs.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'forecast';
    const venueId = searchParams.get('venue_id') || (venueIds.length === 1 ? venueIds[0] : null);
    const horizon = parseInt(searchParams.get('horizon_days') || '7', 10);

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    if (mode === 'needs') {
      const urgency = searchParams.get('urgency') as 'critical' | 'warning' | undefined;
      const needs = await getIngredientNeeds(venueId, urgency || undefined);
      return NextResponse.json({ needs });
    }

    const forecast = await getIngredientDemandForecast(venueId, horizon);
    return NextResponse.json({ forecast });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/inventory/forecast
 * Refresh item mix ratios.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser();
    await refreshItemMixRatios();
    return NextResponse.json({ success: true, message: 'Item mix ratios refreshed' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
