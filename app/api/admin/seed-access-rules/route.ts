/**
 * Seed Access Rules from SevenRooms
 *
 * POST /api/admin/seed-access-rules?venue_id=xxx (optional, seeds all if omitted)
 *
 * One-time migration helper: fetches current SR shift config and widget
 * access rules, creates corresponding native reservation_access_rules rows.
 *
 * Auth: Platform admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getServiceClient } from '@/lib/supabase/service';
import {
  fetchShiftsForDate,
  fetchWidgetAccessRulesForVenue,
  resolveSevenRoomsVenueId,
} from '@/lib/integrations/sevenrooms';
import { upsertAccessRule } from '@/lib/database/reservations';

// Map SR shift category to our shift_type
function mapShiftType(category: string): string {
  const cat = (category || '').toLowerCase();
  if (cat.includes('brunch')) return 'brunch';
  if (cat.includes('breakfast')) return 'breakfast';
  if (cat.includes('lunch')) return 'lunch';
  if (cat.includes('late') || cat.includes('night')) return 'late_night';
  return 'dinner';
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  const ctx = await resolveContext();
  if (!ctx?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Platform admin required' }, { status: 403 });
  }

  const venueFilter = request.nextUrl.searchParams.get('venue_id');
  const supabase = getServiceClient();

  // Get all SR-connected venues
  const query = (supabase as any)
    .from('sevenrooms_venue_settings')
    .select('venue_id, org_id, sr_venue_id, covers_per_interval, custom_pacing, interval_minutes, turn_time_overrides')
    .eq('is_connected', true)
    .not('sr_venue_id', 'is', null);

  if (venueFilter) {
    query.eq('venue_id', venueFilter);
  }

  const { data: venues, error: venueErr } = await query;

  if (venueErr || !venues?.length) {
    return NextResponse.json({
      error: 'No SR-connected venues found',
      details: venueErr?.message,
    }, { status: 404 });
  }

  // Use tomorrow for shift fetching (today's shifts may be partially over)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const results: Array<{ venue_id: string; rules_created: number; errors: string[] }> = [];

  for (const venue of venues) {
    const venueResult = { venue_id: venue.venue_id, rules_created: 0, errors: [] as string[] };

    try {
      const srVenueId = resolveSevenRoomsVenueId(venue.venue_id);
      if (!srVenueId) {
        venueResult.errors.push('No SR venue ID mapped');
        results.push(venueResult);
        continue;
      }

      // Fetch SR shifts and widget access rules in parallel
      const [shifts, widgetData] = await Promise.all([
        fetchShiftsForDate(srVenueId, tomorrow).catch(() => []),
        fetchWidgetAccessRulesForVenue(venue.venue_id, tomorrow).catch(() => []),
      ]);

      // Create access rules from SR shifts
      for (const shift of shifts) {
        try {
          // Use KevaOS override values when they exist, SR defaults as base
          const coversPerInterval = venue.covers_per_interval ?? shift.covers_per_seating_interval ?? 20;
          const customPacing = venue.custom_pacing && Object.keys(venue.custom_pacing).length > 0
            ? venue.custom_pacing
            : shift.custom_pacing || {};
          const intervalMinutes = venue.interval_minutes ?? shift.interval_minutes ?? 30;
          const turnTimes = venue.turn_time_overrides && Object.keys(venue.turn_time_overrides).length > 0
            ? venue.turn_time_overrides
            : shift.duration_minutes_by_party_size || { '-1': 90 };

          await upsertAccessRule(venue.org_id, venue.venue_id, {
            name: shift.name || 'Dinner',
            shift_type: mapShiftType(shift.category),
            start_time: shift.start_time?.slice(0, 5) || '17:00',
            end_time: shift.end_time?.slice(0, 5) || '23:00',
            interval_minutes: intervalMinutes,
            max_covers_per_interval: coversPerInterval,
            custom_pacing: customPacing,
            turn_times: turnTimes,
            ai_managed: false, // Start manual, enable AI per-rule
            is_active: true,
          });

          venueResult.rules_created++;
        } catch (err: any) {
          venueResult.errors.push(`Shift "${shift.name}": ${err.message}`);
        }
      }

      // Enrich rules with widget access rule data (seating areas, policies)
      for (const shiftData of widgetData) {
        for (const rule of shiftData.accessRules) {
          if (!rule.description || rule.slots.length === 0) continue;

          // Only create if not already created from shifts
          try {
            await upsertAccessRule(venue.org_id, venue.venue_id, {
              name: rule.description,
              shift_type: mapShiftType(shiftData.shiftName),
              start_time: rule.slots[0].time || '17:00',
              end_time: rule.slots[rule.slots.length - 1].time || '23:00',
              max_covers_per_interval: rule.pacingLimit ?? 20,
              min_spend: rule.minSpend ?? null,
              service_charge_pct: rule.serviceCharge ?? 0,
              gratuity_pct: rule.gratuity ?? 0,
              is_active: true,
            });
            venueResult.rules_created++;
          } catch {
            // Likely conflict with existing rule — safe to skip
          }
        }
      }
    } catch (err: any) {
      venueResult.errors.push(err.message);
    }

    results.push(venueResult);
  }

  return NextResponse.json({
    success: true,
    venues_processed: venues.length,
    total_rules: results.reduce((s, r) => s + r.rules_created, 0),
    results,
    duration_ms: Date.now() - t0,
  });
}
