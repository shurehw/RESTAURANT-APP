/**
 * Tripleseat Webhook Receiver
 *
 * POST /api/webhooks/tripleseat
 *
 * Receives event lifecycle webhooks from Tripleseat:
 *   - Create Event, Update Event, Delete Event, Status Change Event
 *
 * On confirmed buyouts/private events:
 *   → Upserts into tripleseat_events
 *   → DB trigger auto-flags venue_day_anomalies for forecast exclusion
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { verifyWebhookSignature } from '@/lib/integrations/tripleseat';
import type { TripleseatEvent } from '@/lib/integrations/tripleseat';
import { markTripleseatSynced } from '@/lib/database/demand-calendar';

const INACTIVE_EVENT_STATUSES = new Set(['cancelled', 'canceled', 'declined', 'lost', 'archived']);

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Classify an event as buyout vs private based on actual Tripleseat data.
 * Real events don't have nested bookings — buyout info is in room names or event type.
 */
function classifyFromPayload(event: TripleseatEvent): {
  isBuyout: boolean;
  eventType: string;
  totalMinimum: number;
  estimatedRevenue: number;
} {
  const roomNames = (event.rooms || []).map(r => r.name.toLowerCase());
  const eventName = (event.name || '').toLowerCase();
  const rawType = (event.event_type || '').toLowerCase();

  // Detect buyout from room names, event type, or event name
  const isBuyout = roomNames.some(r => r.includes('buyout'))
    || rawType.includes('buyout')
    || eventName.includes('buyout');

  // Classify event type
  let eventType = 'private_event';
  if (isBuyout) {
    eventType = 'buyout';
  } else if (rawType.includes('semi')) {
    eventType = 'semi_private';
  } else if (rawType.includes('reception') || rawType.includes('cocktail')) {
    eventType = 'reception';
  }

  // Parse financial fields (strings like "50000.0")
  const totalMinimum = parseFloat(event.food_and_beverage_min || '0') || 0;
  const estimatedRevenue = parseFloat(event.grand_total || '0') || 0;

  return { isBuyout, eventType, totalMinimum, estimatedRevenue };
}

async function syncDemandCalendarForDate(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
  venueId: string,
  eventDate: string,
) {
  const { data: eventsData } = await (supabase as any)
    .from('tripleseat_events')
    .select('status, event_type, is_buyout, guest_count, guaranteed_count, estimated_revenue')
    .eq('venue_id', venueId)
    .eq('event_date', eventDate);

  const events = (eventsData || []) as Array<{
    status: string | null;
    event_type: string | null;
    is_buyout: boolean | null;
    guest_count: number | null;
    guaranteed_count: number | null;
    estimated_revenue: number | null;
  }>;

  const activeEvents = events.filter((ev) => !INACTIVE_EVENT_STATUSES.has((ev.status || '').toLowerCase()));
  const hasPrivateEvent = activeEvents.length > 0;
  const anyBuyout = activeEvents.some(
    (ev) => Boolean(ev.is_buyout) || (ev.event_type || '').toLowerCase() === 'buyout',
  );
  const guestCount = hasPrivateEvent
    ? activeEvents.reduce((sum, ev) => sum + (ev.guest_count || ev.guaranteed_count || 0), 0)
    : null;
  const revenue = hasPrivateEvent
    ? Math.round(activeEvents.reduce((sum, ev) => sum + (ev.estimated_revenue || 0), 0) * 100) / 100
    : null;

  await markTripleseatSynced(orgId, venueId, eventDate, {
    has_private_event: hasPrivateEvent,
    private_event_type: hasPrivateEvent ? (anyBuyout ? 'buyout' : 'private_event') : null,
    private_event_guest_count: guestCount,
    private_event_revenue: revenue,
    private_event_is_buyout: anyBuyout,
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Read raw body for signature verification
    const rawBody = await request.text();

    // 2. Verify webhook signature
    const signature = request.headers.get('x-tripleseat-signature')
      || request.headers.get('x-signature')
      || '';

    const signingKey = process.env.TRIPLESEAT_WEBHOOK_SIGNING_KEY;
    if (!signingKey) {
      console.error('[tripleseat-webhook] TRIPLESEAT_WEBHOOK_SIGNING_KEY not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (signature && !verifyWebhookSignature(rawBody, signature, signingKey)) {
      console.error('[tripleseat-webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 3. Parse payload — Tripleseat wraps events as { event: { ... } }
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error('[tripleseat-webhook] Invalid JSON payload');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const event: TripleseatEvent | undefined =
      payload.event || payload.data?.event || payload;
    const action = payload.action
      || request.headers.get('x-tripleseat-action')
      || 'update';

    if (!event?.id) {
      console.warn('[tripleseat-webhook] No event ID in payload, skipping');
      return NextResponse.json({ received: true, skipped: true });
    }

    console.log(
      `[tripleseat-webhook] ${action} event ${event.id}: ${event.name || 'unnamed'} ` +
      `(status: ${event.status}, date: ${event.event_date_iso8601 || event.event_date})`,
    );

    // 4. Resolve venue from location_id
    const supabase = getServiceClient();

    const locationId = String(event.location_id || '');
    if (!locationId) {
      console.warn('[tripleseat-webhook] No location_id in event, skipping');
      return NextResponse.json({ received: true, skipped: true, reason: 'no_location_id' });
    }

    const { data: mapping } = await supabase
      .from('tripleseat_venue_mapping')
      .select('venue_id')
      .eq('tripleseat_site_id', locationId)
      .eq('is_active', true)
      .maybeSingle();

    if (!mapping) {
      console.warn(`[tripleseat-webhook] No venue mapping for location ${locationId}, skipping`);
      return NextResponse.json({ received: true, skipped: true, reason: 'unmapped_location' });
    }

    const venueId = mapping.venue_id;
    const { data: venueRow } = await supabase
      .from('venues')
      .select('organization_id')
      .eq('id', venueId)
      .maybeSingle();
    const orgId = (venueRow as any)?.organization_id as string | null;

    // Extract event date early so delete actions can also re-sync demand calendar.
    const eventDate = event.event_date_iso8601
      ? event.event_date_iso8601.substring(0, 10)
      : (event.event_date ? event.event_date.substring(0, 10) : null);

    // 5. Handle delete action
    if (action === 'delete') {
      let dateForSync = eventDate;
      if (!dateForSync) {
        const { data: existing } = await (supabase as any)
          .from('tripleseat_events')
          .select('event_date')
          .eq('tripleseat_event_id', event.id)
          .maybeSingle();
        dateForSync = existing?.event_date || null;
      }

      await supabase
        .from('tripleseat_events')
        .delete()
        .eq('tripleseat_event_id', event.id);

      if (orgId && dateForSync) {
        await syncDemandCalendarForDate(supabase, orgId, venueId, dateForSync);
      }

      console.log(`[tripleseat-webhook] Deleted event ${event.id}`);
      return NextResponse.json({
        received: true,
        action: 'deleted',
        demand_calendar_synced: Boolean(orgId && dateForSync),
      });
    }

    // 6. Classify the event
    const classification = classifyFromPayload(event);

    if (!eventDate) {
      console.warn('[tripleseat-webhook] No event_date, skipping');
      return NextResponse.json({ received: true, skipped: true, reason: 'no_date' });
    }

    // Extract start/end times from ISO timestamps
    const startTime2 = event.event_start_iso8601
      ? event.event_start_iso8601.substring(11, 19)
      : null;
    const endTime = event.event_end_iso8601
      ? event.event_end_iso8601.substring(11, 19)
      : null;

    // Room name from first room
    const roomName = event.rooms?.[0]?.name || null;

    // Contact info
    const contactName = event.contact
      ? [event.contact.first_name, event.contact.last_name].filter(Boolean).join(' ')
      : null;

    // 7. Upsert the event
    const { error } = await supabase
      .from('tripleseat_events')
      .upsert({
        venue_id: venueId,
        tripleseat_event_id: event.id,
        tripleseat_booking_id: event.booking_id || null,
        event_name: event.name || null,
        event_type: classification.eventType,
        status: (event.status || 'prospect').toLowerCase(),
        event_date: eventDate,
        start_time: startTime2,
        end_time: endTime,
        guest_count: event.guest_count || null,
        guaranteed_count: event.guaranteed_guest_count || null,
        food_minimum: classification.totalMinimum || null,
        beverage_minimum: null, // Not broken out in Tripleseat event data
        total_minimum: classification.totalMinimum || null,
        estimated_revenue: classification.estimatedRevenue || null,
        room_name: roomName,
        is_buyout: classification.isBuyout,
        contact_name: contactName,
        contact_email: event.contact?.email || null,
        raw_payload: payload,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tripleseat_event_id',
      });

    if (error) {
      console.error('[tripleseat-webhook] Upsert error:', error.message);
      return NextResponse.json(
        { error: 'Failed to store event' },
        { status: 500 },
      );
    }

    let calendarSynced = false;
    if (orgId) {
      await syncDemandCalendarForDate(supabase, orgId, venueId, eventDate);
      calendarSynced = true;
    } else {
      console.warn(`[tripleseat-webhook] Missing org_id for venue ${venueId}; skipping demand_calendar sync`);
    }

    const duration = Date.now() - startTime;
    console.log(
      `[tripleseat-webhook] Processed event ${event.id} for venue ${venueId} ` +
      `(${classification.eventType}, buyout: ${classification.isBuyout}, ` +
      `min: $${classification.totalMinimum}) in ${duration}ms`,
    );

    return NextResponse.json({
      received: true,
      event_id: event.id,
      venue_id: venueId,
      event_type: classification.eventType,
      is_buyout: classification.isBuyout,
      demand_calendar_synced: calendarSynced,
      duration_ms: duration,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tripleseat-webhook] Error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

// Tripleseat may send a GET to verify the endpoint is live
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'tripleseat-webhook' });
}
