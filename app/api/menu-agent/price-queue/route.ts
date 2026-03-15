/**
 * Menu Agent Price Queue
 *
 * GET  /api/menu-agent/price-queue — Current queue + margin bleed summary
 * POST /api/menu-agent/price-queue — Approve/reject/apply queued changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getAllQueuedChanges,
  getMarginBleedSummary,
  getQueuedChangesForReprint,
  approveQueuedChange,
  rejectQueuedChange,
  applyQueuedChange,
} from '@/lib/database/menu-price-queue';
import { recordPriceChange } from '@/lib/database/menu-agent';

export async function GET(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { venueIds } = await getUserOrgAndVenues(ctx.authUserId);
  const venueId = request.nextUrl.searchParams.get('venue_id');
  if (!venueId) {
    return NextResponse.json({ error: 'Missing venue_id' }, { status: 400 });
  }
  assertVenueAccess(venueId, venueIds);

  const reprintDate = request.nextUrl.searchParams.get('reprint_date');

  const [queue, bleedSummary] = await Promise.all([
    reprintDate
      ? getQueuedChangesForReprint(venueId, reprintDate)
      : getAllQueuedChanges(venueId),
    getMarginBleedSummary(venueId),
  ]);

  return NextResponse.json({
    queue,
    margin_bleed: bleedSummary,
  });
}

export async function POST(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, action, reason } = body;

  if (!id || !action) {
    return NextResponse.json(
      { error: 'Missing id or action' },
      { status: 400 }
    );
  }

  switch (action) {
    case 'approve':
      await approveQueuedChange(id, ctx.authUserId);
      return NextResponse.json({ success: true, status: 'approved' });

    case 'reject':
      await rejectQueuedChange(id, ctx.authUserId, reason || 'Rejected by manager');
      return NextResponse.json({ success: true, status: 'rejected' });

    case 'apply': {
      // Apply = update recipe price + record history + mark applied
      const { getServiceClient } = await import('@/lib/supabase/service');
      const supabase = getServiceClient();

      // Get the queue entry
      const { data: entry } = await (supabase as any)
        .from('menu_agent_price_queue')
        .select('*')
        .eq('id', id)
        .single();

      if (!entry) {
        return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });
      }

      // Update recipe price
      await (supabase as any)
        .from('recipes')
        .update({ menu_price: entry.recommended_price })
        .eq('id', entry.recipe_id)
        .is('effective_to', null);

      // Record price history
      await recordPriceChange({
        venue_id: entry.venue_id,
        recipe_id: entry.recipe_id,
        old_price: entry.current_price,
        new_price: entry.recommended_price,
        source: 'menu_agent',
        recommendation_id: entry.recommendation_id,
        notes: `Applied from price queue at reprint`,
      });

      // Mark applied
      await applyQueuedChange(id);

      return NextResponse.json({ success: true, status: 'applied' });
    }

    default:
      return NextResponse.json(
        { error: 'Action must be approve, reject, or apply' },
        { status: 400 }
      );
  }
}
