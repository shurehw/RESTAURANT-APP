/**
 * Pacing Recommendations API
 *
 * GET  /api/reservations/recommendations?venue_id=xxx&date=YYYY-MM-DD
 * POST /api/reservations/recommendations (accept/dismiss/modify)
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import {
  getPendingForVenueDate,
  updateRecommendationStatus,
} from '@/lib/database/pacing-recommendations';
import { upsertSettings } from '@/lib/database/sevenrooms-settings';
import {
  getAccessRulesForVenue,
  aiAdjustAccessRule,
} from '@/lib/database/reservations';

/**
 * GET — Returns pending recommendations for a venue/date.
 */
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':pacing-recs');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const venueId = request.nextUrl.searchParams.get('venue_id');
    const date = request.nextUrl.searchParams.get('date');

    if (!venueId || !date) {
      return NextResponse.json({ error: 'venue_id and date are required' }, { status: 400 });
    }

    const recommendations = await getPendingForVenueDate(venueId, date);
    return NextResponse.json({ success: true, recommendations });
  });
}

/**
 * POST — Accept, dismiss, or modify a recommendation.
 *
 * Body: { recommendation_id, action: 'accept' | 'dismiss', modified_value?: number }
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':pacing-recs');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'director', 'admin', 'platform_admin'].includes(role || '')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { recommendation_id, action, modified_value } = body;

    if (!recommendation_id || !['accept', 'dismiss'].includes(action)) {
      return NextResponse.json(
        { error: 'recommendation_id and action (accept/dismiss) required' },
        { status: 400 },
      );
    }

    if (action === 'dismiss') {
      const ok = await updateRecommendationStatus(recommendation_id, 'dismissed', user.id);
      return NextResponse.json({ success: ok });
    }

    // Accept — apply the recommendation
    // First, get the recommendation details
    const { getServiceClient } = await import('@/lib/supabase/service');
    const supabase = getServiceClient();
    const { data: rec } = await (supabase as any)
      .from('pacing_recommendations')
      .select('*')
      .eq('id', recommendation_id)
      .single();

    if (!rec) {
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    // Determine what value to apply
    const valueToApply = modified_value ?? rec.recommended_value?.value;

    // Check if venue has native access rules — if so, apply there instead of SR settings
    const nativeRules = await getAccessRulesForVenue(rec.venue_id);
    const hasNativeRules = nativeRules.length > 0;

    if (hasNativeRules) {
      // Apply to native access rules
      const matchingRule = nativeRules.find(r => {
        if (rec.rec_type === 'channel' && rec.slot_label) {
          return r.name === rec.slot_label;
        }
        return true; // For covers/pacing/turn_time, use first active rule
      });

      if (!matchingRule) {
        await updateRecommendationStatus(recommendation_id, 'accepted', user.id);
        return NextResponse.json({ success: true, applied: {}, message: 'No matching access rule found' });
      }

      const field = rec.rec_type === 'covers' ? 'max_covers_per_interval'
        : rec.rec_type === 'pacing' ? 'custom_pacing'
        : rec.rec_type === 'turn_time' ? 'turn_times'
        : 'channel_allocation';

      let newValue: unknown = valueToApply;

      // For pacing, merge into custom_pacing object
      if (rec.rec_type === 'pacing' && rec.slot_label) {
        const match = rec.slot_label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (match) {
          let h = parseInt(match[1]);
          if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
          if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
          newValue = { ...matchingRule.custom_pacing, [`${h}:${match[2]}`]: valueToApply };
        }
      } else if (rec.rec_type === 'turn_time') {
        newValue = { ...matchingRule.turn_times, [rec.slot_label || '-1']: valueToApply };
      }

      await aiAdjustAccessRule(
        matchingRule.id,
        field,
        rec.current_value?.value,
        newValue,
        rec.reasoning || 'Accepted recommendation',
        'manual-accept',
        recommendation_id,
      );

      await updateRecommendationStatus(recommendation_id, 'applied', user.id);
      return NextResponse.json({ success: true, applied: { rule: matchingRule.name, field, value: newValue } });
    }

    // Fallback: apply to SR settings (legacy path)

    // Channel recommendations are advisory when using SR
    if (rec.rec_type === 'channel') {
      await updateRecommendationStatus(recommendation_id, 'accepted', user.id);
      return NextResponse.json({
        success: true,
        applied: {},
        advisory: true,
        message: 'Channel recommendation acknowledged. Apply in SR Admin > Access Rules.',
      });
    }

    const updates: Record<string, unknown> = {};
    if (rec.rec_type === 'covers') {
      updates.covers_per_interval = valueToApply;
    } else if (rec.rec_type === 'pacing' && rec.slot_label) {
      const { data: current } = await (supabase as any)
        .from('sevenrooms_venue_settings')
        .select('custom_pacing')
        .eq('venue_id', rec.venue_id)
        .maybeSingle();

      const pacing = current?.custom_pacing || {};
      const match = rec.slot_label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (match) {
        let h = parseInt(match[1]);
        const m = match[2];
        if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
        if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
        pacing[`${h}:${m}`] = valueToApply;
      }
      updates.custom_pacing = pacing;
    } else if (rec.rec_type === 'turn_time') {
      const { data: current } = await (supabase as any)
        .from('sevenrooms_venue_settings')
        .select('turn_time_overrides')
        .eq('venue_id', rec.venue_id)
        .maybeSingle();

      const turns = current?.turn_time_overrides || {};
      turns[rec.slot_label || '-1'] = valueToApply;
      updates.turn_time_overrides = turns;
    }

    await upsertSettings(rec.venue_id, orgId, updates, user.id);
    await updateRecommendationStatus(recommendation_id, 'accepted', user.id);

    return NextResponse.json({ success: true, applied: updates });
  });
}
