/**
 * AI Seat Suggestion
 *
 * GET  /api/floor-plan/live/suggest-seat?venue_id&date&reservation_id&trigger
 *   Runs findBestTableForParty() for the reservation, logs the suggestion,
 *   and returns the top recommended table with suggestion_id for tracking.
 *
 * POST /api/floor-plan/live/suggest-seat
 *   Body: { suggestion_id, outcome, actual_table_id?, actual_table_number? }
 *   Records the outcome (accepted | overridden | dismissed | expired).
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import { findBestTableForParty } from '@/lib/database/floor-management';

// ── GET ───────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get('venue_id');
    const date = searchParams.get('date');
    const reservation_id = searchParams.get('reservation_id');
    const trigger = (searchParams.get('trigger') || 'arrived') as 'arrived' | 'table_opened';

    if (!venue_id || !date || !reservation_id) {
      return NextResponse.json({ error: 'venue_id, date, reservation_id required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const supabase = getServiceClient();

    // Fetch the reservation for party size + section preference
    const { data: rez } = await (supabase as any)
      .from('reservations')
      .select('id, venue_id, first_name, last_name, party_size, section_id, notes, is_vip')
      .eq('id', reservation_id)
      .eq('venue_id', venue_id)
      .single();

    if (!rez) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // Check if there's already an open suggestion for this reservation
    const { data: existingSuggestion } = await (supabase as any)
      .from('seating_suggestions')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('reservation_id', reservation_id)
      .is('outcome', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingSuggestion) {
      // Don't flood with duplicate suggestions
      return NextResponse.json({ suggestion: null, reason: 'open_suggestion_exists' });
    }

    // Run seating algorithm
    const candidates = await findBestTableForParty(venue_id, date, rez.party_size, {
      section_id: rez.section_id || undefined,
    });

    if (!candidates.length) {
      return NextResponse.json({ suggestion: null, reason: 'no_available_tables' });
    }

    const top = candidates[0];

    // Fetch section name for the suggested table
    const { data: section } = top.section_id
      ? await (supabase as any)
          .from('venue_sections')
          .select('name, color')
          .eq('id', top.section_id)
          .single()
      : { data: null };

    // Log the suggestion
    const guestName = `${rez.first_name} ${rez.last_name}`.trim() || 'Guest';
    const { data: suggestion, error } = await (supabase as any)
      .from('seating_suggestions')
      .insert({
        org_id: orgId,
        venue_id,
        business_date: date,
        trigger,
        reservation_id,
        guest_name: guestName,
        party_size: rez.party_size,
        suggested_table_id: top.table_id,
        suggested_table_number: top.table_number,
        suggested_section_id: top.section_id,
        score: top.score,
        reason: buildReason(top, rez, section),
      })
      .select()
      .single();

    if (error) {
      console.error('[suggest-seat] Failed to log suggestion:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      suggestion: {
        id: suggestion.id,
        expires_at: suggestion.expires_at,
        guest_name: guestName,
        party_size: rez.party_size,
        reservation_id,
        is_vip: rez.is_vip,
        table_id: top.table_id,
        table_number: top.table_number,
        section_id: top.section_id,
        section_name: section?.name ?? null,
        section_color: section?.color ?? null,
        score: top.score,
        reason: suggestion.reason,
      },
    });
  });
}

// ── POST ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { suggestion_id, outcome, actual_table_id, actual_table_number } = body;

    if (!suggestion_id || !outcome) {
      return NextResponse.json({ error: 'suggestion_id and outcome required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Ensure caller can mutate this suggestion
    const { data: suggestion } = await (supabase as any)
      .from('seating_suggestions')
      .select('id, org_id, venue_id')
      .eq('id', suggestion_id)
      .maybeSingle();

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }
    if (suggestion.org_id !== orgId || !venueIds.includes(suggestion.venue_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await (supabase as any)
      .from('seating_suggestions')
      .update({
        outcome,
        actual_table_id: actual_table_id ?? null,
        actual_table_number: actual_table_number ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', suggestion_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

function buildReason(
  top: { table_id: string; table_number: string; section_id: string | null; score: number },
  rez: { party_size: number; section_id: string | null; is_vip: boolean },
  section: { name: string } | null,
): string {
  const parts: string[] = [];
  if (section) parts.push(`${section.name} section`);
  if (rez.is_vip) parts.push('VIP placement');
  if (rez.section_id && rez.section_id === top.section_id) parts.push('preferred section');
  parts.push(`capacity fit for ${rez.party_size}`);
  return parts.join(', ');
}
