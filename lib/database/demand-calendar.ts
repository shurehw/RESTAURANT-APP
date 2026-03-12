/**
 * Demand Calendar — DB Layer
 *
 * Pre-computed per-venue/date demand modifiers.
 * Enriched nightly by compute-rez-metrics cron.
 * Read by posture + evaluate routes to populate ForecastContext.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Types ──────────────────────────────────────────────────

export interface DemandCalendarEntry {
  id: string;
  org_id: string;
  venue_id: string;
  business_date: string;

  // Holiday
  is_holiday: boolean;
  holiday_name: string | null;
  holiday_impact: 'positive' | 'negative' | 'neutral' | null;

  // Private events (Tripleseat)
  has_private_event: boolean;
  private_event_type: string | null;
  private_event_guest_count: number | null;
  private_event_revenue: number | null;
  private_event_is_buyout: boolean;

  // Claude-synthesized modifier
  demand_multiplier: number;
  is_quiet_period: boolean;
  narrative: string | null;
  confidence: 'high' | 'medium' | 'low';
  raw_signals: Record<string, unknown>;

  // Pacing guidance
  open_pacing_recommended: boolean;
  lookahead_extension_days: number;

  computed_at: string;
  tripleseat_synced_at: string | null;
  ai_enriched_at: string | null;
}

export type DemandCalendarUpsert = Omit<DemandCalendarEntry, 'id' | 'computed_at'> & {
  computed_at?: string;
};

// ── Queries ────────────────────────────────────────────────

/**
 * Get a single demand calendar entry for a venue/date.
 * Returns null if not yet enriched.
 */
export async function getDemandCalendarEntry(
  venueId: string,
  date: string,
): Promise<DemandCalendarEntry | null> {
  const { data, error } = await (supabase as any)
    .from('demand_calendar')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch demand calendar: ${error.message}`);
  return data as DemandCalendarEntry | null;
}

/**
 * Get demand calendar entries for a venue across a date range.
 */
export async function getDemandCalendarRange(
  venueId: string,
  startDate: string,
  endDate: string,
): Promise<DemandCalendarEntry[]> {
  const { data, error } = await (supabase as any)
    .from('demand_calendar')
    .select('*')
    .eq('venue_id', venueId)
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('business_date', { ascending: true });

  if (error) throw new Error(`Failed to fetch demand calendar range: ${error.message}`);
  return (data || []) as DemandCalendarEntry[];
}

/**
 * Get dates in a range that need AI enrichment (no entry, or entry older than maxAgeDays).
 */
export async function getDatesNeedingEnrichment(
  venueId: string,
  startDate: string,
  endDate: string,
  maxAgeDays = 7,
): Promise<string[]> {
  const { data } = await (supabase as any)
    .from('demand_calendar')
    .select('business_date, ai_enriched_at, tripleseat_synced_at')
    .eq('venue_id', venueId)
    .gte('business_date', startDate)
    .lte('business_date', endDate);

  const existingMap = new Map<string, { ai_enriched_at: string | null; tripleseat_synced_at: string | null }>(
    ((data || []) as Array<{
      business_date: string;
      ai_enriched_at: string | null;
      tripleseat_synced_at: string | null;
    }>).map(
      (r) => [r.business_date, {
        ai_enriched_at: r.ai_enriched_at,
        tripleseat_synced_at: r.tripleseat_synced_at,
      }],
    ),
  );

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - maxAgeDays);

  // Build full date list in range
  const dates: string[] = [];
  const cursor = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');
  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);
    const existing = existingMap.get(d);
    const enrichedAt = existing?.ai_enriched_at ?? null;
    const syncedAt = existing?.tripleseat_synced_at ?? null;

    const missingOrStale = !enrichedAt || new Date(enrichedAt) < staleThreshold;
    const needsResyncFromTripleseat = Boolean(
      enrichedAt && syncedAt && new Date(syncedAt) > new Date(enrichedAt),
    );

    // Needs enrichment if:
    // 1) no AI enrichment yet,
    // 2) enrichment is stale,
    // 3) Tripleseat signals were synced after AI enrichment.
    if (missingOrStale || needsResyncFromTripleseat) {
      dates.push(d);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

/**
 * Upsert a batch of demand calendar entries.
 */
export async function upsertDemandCalendar(
  entries: DemandCalendarUpsert[],
): Promise<number> {
  if (entries.length === 0) return 0;

  const rows = entries.map((e) => ({
    ...e,
    computed_at: new Date().toISOString(),
  }));

  const { error } = await (supabase as any)
    .from('demand_calendar')
    .upsert(rows, { onConflict: 'venue_id,business_date' });

  if (error) throw new Error(`Failed to upsert demand calendar: ${error.message}`);
  return rows.length;
}

/**
 * Mark Tripleseat sync complete for a venue/date.
 */
export async function markTripleseatSynced(
  orgId: string,
  venueId: string,
  date: string,
  eventData: {
    has_private_event: boolean;
    private_event_type?: string | null;
    private_event_guest_count?: number | null;
    private_event_revenue?: number | null;
    private_event_is_buyout?: boolean;
  },
): Promise<void> {
  const { error } = await (supabase as any)
    .from('demand_calendar')
    .upsert(
      {
        org_id: orgId,
        venue_id: venueId,
        business_date: date,
        ...eventData,
        tripleseat_synced_at: new Date().toISOString(),
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'venue_id,business_date' },
    );

  if (error) throw new Error(`Failed to mark Tripleseat sync: ${error.message}`);
}
