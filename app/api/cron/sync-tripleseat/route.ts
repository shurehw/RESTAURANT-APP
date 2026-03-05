/**
 * Tripleseat Event Sync Cron
 *
 * GET /api/cron/sync-tripleseat
 *
 * Runs every 6 hours to pull new/updated events from Tripleseat.
 * Looks at events from today through 6 months out (captures new bookings).
 * Also re-syncs the last 30 days to catch status changes on past events.
 *
 * The webhook handles real-time updates; this is the catch-up safety net.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { classifyEvent } from '@/lib/integrations/tripleseat';
import type { TripleseatEvent } from '@/lib/integrations/tripleseat';
import { createHmac, randomBytes } from 'crypto';

const BASE_URL = 'https://api.tripleseat.com/v1';
const RATE_LIMIT_MS = 120; // ~8 req/sec, under the 10/sec limit

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

// ── OAuth 1.0 signing (self-contained for cron isolation) ───────────────

function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, '%21').replace(/\*/g, '%2A')
    .replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function oauthHeader(method: string, url: string, params: Record<string, string>): string {
  const apiKey = process.env.TRIPLESEAT_API_KEY!;
  const secretKey = process.env.TRIPLESEAT_SECRET_KEY!;

  const op: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };
  const all = { ...params, ...op };
  const sorted = Object.keys(all).sort();
  const paramStr = sorted.map(k => `${percentEncode(k)}=${percentEncode(all[k])}`).join('&');
  const baseStr = [method.toUpperCase(), percentEncode(url), percentEncode(paramStr)].join('&');
  const sig = createHmac('sha1', `${percentEncode(secretKey)}&`).update(baseStr).digest('base64');
  op.oauth_signature = sig;
  return 'OAuth ' + Object.entries(op).map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`).join(', ');
}

async function tsFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = `${BASE_URL}${path}`;
  const auth = oauthHeader('GET', url, params);
  const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const fullUrl = qs ? `${url}?${qs}` : url;

  const res = await fetch(fullUrl, {
    headers: { Authorization: auth, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tripleseat ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main sync logic ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.TRIPLESEAT_API_KEY || !process.env.TRIPLESEAT_SECRET_KEY) {
    return NextResponse.json({ error: 'Tripleseat not configured' }, { status: 500 });
  }

  const startTime = Date.now();
  const supabase = getServiceClient();

  try {
    // Load venue mappings
    const { data: mappingsRaw } = await (supabase as any)
      .from('tripleseat_venue_mapping')
      .select('venue_id, tripleseat_site_id')
      .eq('is_active', true);

    const mappings = mappingsRaw as Array<{ venue_id: string; tripleseat_site_id: number }> | null;

    if (!mappings?.length) {
      return NextResponse.json({ error: 'No venue mappings configured' }, { status: 500 });
    }

    const venueMap = new Map(mappings.map(m => [String(m.tripleseat_site_id), m.venue_id]));

    // Date range: 30 days back through 6 months forward
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 6);

    const startStr = startDate.toISOString().substring(0, 10);
    const endStr = endDate.toISOString().substring(0, 10);

    console.log(`[tripleseat-sync] Syncing events from ${startStr} to ${endStr}`);

    // Paginate through all events in range
    let page = 1;
    let upsertCount = 0;
    let skipCount = 0;

    while (true) {
      const data = await tsFetch('/events/search.json', {
        start_date: startStr,
        end_date: endStr,
        per_page: '50',
        page: String(page),
      });

      const rawResults = data?.results || [];
      if (rawResults.length === 0) break;

      const events: TripleseatEvent[] = rawResults.map((e: any) => e.event || e);

      // Build upsert batch
      const rows = [];
      for (const ev of events) {
        const venueId = venueMap.get(String(ev.location_id));
        if (!venueId || !ev.event_date_iso8601) {
          skipCount++;
          continue;
        }

        const cls = classifyEvent(ev);
        const contactName = ev.contact
          ? [ev.contact?.first_name, ev.contact?.last_name].filter(Boolean).join(' ')
          : null;

        rows.push({
          venue_id: venueId,
          tripleseat_event_id: ev.id,
          tripleseat_booking_id: ev.booking_id || null,
          event_name: ev.name || null,
          event_type: cls.eventType,
          status: (ev.status || 'prospect').toLowerCase(),
          event_date: ev.event_date_iso8601,
          start_time: ev.event_start_iso8601?.substring(11, 19) || null,
          end_time: ev.event_end_iso8601?.substring(11, 19) || null,
          guest_count: ev.guest_count || null,
          guaranteed_count: ev.guaranteed_guest_count || null,
          food_minimum: cls.totalMinimum || null,
          beverage_minimum: null,
          total_minimum: cls.totalMinimum || null,
          estimated_revenue: cls.estimatedRevenue || null,
          room_name: ev.rooms?.[0]?.name || null,
          is_buyout: cls.isBuyout,
          contact_name: contactName,
          contact_email: ev.contact?.email || null,
          raw_payload: ev,
          updated_at: new Date().toISOString(),
        });
      }

      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .from('tripleseat_events')
          .upsert(rows, { onConflict: 'tripleseat_event_id' });

        if (error) {
          console.error(`[tripleseat-sync] Upsert error page ${page}:`, error.message);
        } else {
          upsertCount += rows.length;
        }
      }

      console.log(`[tripleseat-sync] Page ${page}: ${rows.length} upserted, ${events.length - rows.length} skipped`);

      if (page >= (data.total_pages || 1)) break;
      page++;
      await sleep(RATE_LIMIT_MS);
    }

    const duration = Date.now() - startTime;
    console.log(`[tripleseat-sync] Done: ${upsertCount} upserted, ${skipCount} skipped in ${duration}ms`);

    return NextResponse.json({
      synced: upsertCount,
      skipped: skipCount,
      pages: page,
      duration_ms: duration,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tripleseat-sync] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
