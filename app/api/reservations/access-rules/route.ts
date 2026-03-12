/**
 * Access Rules API
 *
 * GET  /api/reservations/access-rules?venue_id=xxx&date=YYYY-MM-DD
 * POST /api/reservations/access-rules (create/update rule)
 * PUT  /api/reservations/access-rules (AI-initiated adjustment)
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import {
  getActiveAccessRulesForDate,
  getAccessRulesForVenue,
  upsertAccessRule,
  updateAccessRule,
  aiAdjustAccessRule,
  getCoversBookedPerSlot,
} from '@/lib/database/reservations';

/**
 * GET — Returns active access rules for a venue/date with current booking counts per slot.
 */
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':access-rules');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const venueId = request.nextUrl.searchParams.get('venue_id');
    const date = request.nextUrl.searchParams.get('date');

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }

    const rules = date
      ? await getActiveAccessRulesForDate(venueId, date)
      : await getAccessRulesForVenue(venueId);

    // If a date is provided, enrich with current booking density
    let slotCoverage: Record<string, number> | null = null;
    if (date) {
      const coverMap = await getCoversBookedPerSlot(venueId, date);
      slotCoverage = Object.fromEntries(coverMap);
    }

    return NextResponse.json({
      success: true,
      rules,
      slot_coverage: slotCoverage,
    });
  });
}

/**
 * POST — Create or update an access rule (manual).
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':access-rules');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'director', 'admin', 'gm'].includes(role || '')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { venue_id, ...ruleData } = body;

    if (!venue_id || !ruleData.name || !ruleData.shift_type) {
      return NextResponse.json(
        { error: 'venue_id, name, and shift_type are required' },
        { status: 400 },
      );
    }

    const rule = await upsertAccessRule(orgId, venue_id, ruleData, user.id);
    return NextResponse.json({ success: true, rule });
  });
}

/**
 * PUT — AI-initiated access rule adjustment.
 * Requires the rule to have ai_managed = true.
 */
export async function PUT(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':access-rules');
    const user = await requireUser();
    const { role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'director', 'admin'].includes(role || '')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { rule_id, field, old_value, new_value, reasoning, model, recommendation_id } = body;

    if (!rule_id || !field || new_value === undefined || !reasoning) {
      return NextResponse.json(
        { error: 'rule_id, field, new_value, and reasoning are required' },
        { status: 400 },
      );
    }

    const change = await aiAdjustAccessRule(
      rule_id,
      field,
      old_value,
      new_value,
      reasoning,
      model || 'manual',
      recommendation_id,
    );

    if (!change) {
      return NextResponse.json(
        { error: 'Failed to adjust rule. Verify rule exists and ai_managed is true.' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, change });
  });
}
