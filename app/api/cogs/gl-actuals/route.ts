import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getGLActuals,
  syncGLActuals,
  getGLCOGSMappings,
  upsertGLCOGSMapping,
  getCOGSVarianceAuto,
} from '@/lib/database/gl-actuals';

/**
 * GET /api/cogs/gl-actuals
 * Query GL actuals, COGS mappings, or variance report.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'actuals';
    const venueId = searchParams.get('venue_id') || (venueIds.length === 1 ? venueIds[0] : null);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (mode === 'mappings') {
      const mappings = await getGLCOGSMappings(orgId);
      return NextResponse.json({ mappings });
    }

    if (mode === 'variance') {
      if (!venueId || !startDate || !endDate) {
        return NextResponse.json({ error: 'venue_id, start_date, end_date required' }, { status: 400 });
      }
      assertVenueAccess(venueId, venueIds);
      const variance = await getCOGSVarianceAuto(venueId, orgId, startDate, endDate);
      return NextResponse.json({ variance });
    }

    if (!venueId || !startDate || !endDate) {
      return NextResponse.json({ error: 'venue_id, start_date, end_date required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    const actuals = await getGLActuals(venueId, startDate, endDate);
    return NextResponse.json({ actuals });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/cogs/gl-actuals
 * Import GL actuals (manual or from integration).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);
    const body = await req.json();

    if (body.mode === 'mapping') {
      const mapping = await upsertGLCOGSMapping({
        org_id: orgId,
        gl_account_id: body.gl_account_id,
        cogs_category: body.cogs_category,
        is_active: body.is_active ?? true,
      });
      return NextResponse.json({ mapping });
    }

    // Import GL actuals
    const entries = Array.isArray(body.entries) ? body.entries : [];
    for (const e of entries) {
      if (!e?.venue_id) {
        return NextResponse.json({ error: 'each entry must include venue_id' }, { status: 400 });
      }
      assertVenueAccess(e.venue_id, venueIds);
    }

    const result = await syncGLActuals(entries.map((e: any) => ({
      ...e,
      org_id: orgId,
      source: body.source || 'manual',
    })));
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
