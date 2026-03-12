import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { getSettingsForVenue, updatePushStatus } from '@/lib/database/sevenrooms-settings';
import { pushShiftSettings } from '@/lib/integrations/sevenrooms';

/**
 * POST /api/integrations/sevenrooms/sync
 *
 * Attempt to push OpSOS pacing overrides to SevenRooms.
 * Body: { venue_id }
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':integrations-sr-sync');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'director', 'admin', 'platform_admin'].includes(role || '')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { venue_id } = await request.json();
    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }

    const settings = await getSettingsForVenue(venue_id);
    if (!settings || settings.org_id !== orgId) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    if (!settings.sr_venue_id) {
      return NextResponse.json({ error: 'No SR venue ID configured' }, { status: 400 });
    }

    // Build payload from overrides
    const payload: Record<string, any> = {};
    if (settings.covers_per_interval != null) {
      payload.covers_per_seating_interval = settings.covers_per_interval;
    }
    if (settings.custom_pacing && Object.keys(settings.custom_pacing).length > 0) {
      payload.custom_pacing = settings.custom_pacing;
    }
    if (settings.interval_minutes != null) {
      payload.interval_minutes = settings.interval_minutes;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No overrides to push' }, { status: 400 });
    }

    const result = await pushShiftSettings(settings.sr_venue_id, payload);
    await updatePushStatus(venue_id, result.status, result.success ? undefined : result.message);

    return NextResponse.json(result);
  });
}
