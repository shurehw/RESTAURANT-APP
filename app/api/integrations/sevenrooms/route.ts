import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import {
  getSettingsForOrg,
  getSettingsForVenue,
  upsertSettings,
  updateSyncStatus,
} from '@/lib/database/sevenrooms-settings';
import { fetchShiftsForDate } from '@/lib/integrations/sevenrooms';

/**
 * GET /api/integrations/sevenrooms?venue_id=xxx (optional)
 *
 * Returns per-venue SR settings + live shift data.
 * When venue_id is provided, also fetches today's live shifts from SR.
 */
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':integrations-sr');
    const user = await requireUser();
    const { orgId } = await getUserOrgAndVenues(user.id);

    const venueId = request.nextUrl.searchParams.get('venue_id');

    if (venueId) {
      // Single venue with live SR data
      const settings = await getSettingsForVenue(venueId);
      if (!settings || settings.org_id !== orgId) {
        return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
      }

      let liveShifts = null;
      if (settings.sr_venue_id) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          liveShifts = await fetchShiftsForDate(settings.sr_venue_id, today);
          await updateSyncStatus(venueId, 'success');
        } catch (err: any) {
          await updateSyncStatus(venueId, 'error', err.message);
        }
      }

      return NextResponse.json({ success: true, settings, liveShifts });
    }

    // All venues for the org
    const venues = await getSettingsForOrg(orgId);
    return NextResponse.json({ success: true, venues });
  });
}

/**
 * PUT /api/integrations/sevenrooms
 *
 * Save pacing/turn-time overrides for a venue.
 * Body: { venue_id, covers_per_interval?, custom_pacing?, interval_minutes?, turn_time_overrides?, sr_venue_id? }
 */
export async function PUT(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':integrations-sr');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'director', 'admin', 'platform_admin'].includes(role || '')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { venue_id, ...updates } = body;

    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }

    // Verify venue belongs to org
    const existing = await getSettingsForVenue(venue_id);
    if (existing && existing.org_id !== orgId) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const saved = await upsertSettings(venue_id, orgId, updates, user.id);
    return NextResponse.json({ success: true, settings: saved });
  });
}
