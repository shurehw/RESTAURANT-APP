/**
 * Demand Calendar Enricher
 *
 * Nightly batch job that pre-computes demand modifiers per venue/date.
 * Three signal layers:
 *   1. US holiday detection — static, deterministic
 *   2. Tripleseat private event data — already synced to DB
 *   3. Claude synthesis — ambient demand, local events, quiet periods
 *
 * Called by compute-rez-metrics cron with a 90-day rolling lookahead.
 * Quiet periods (e.g. Coachella weekends in LA) get flagged for
 * aggressive open-book pacing on surrounding dates.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getDatesNeedingEnrichment, upsertDemandCalendar } from '@/lib/database/demand-calendar';
import type { DemandCalendarUpsert } from '@/lib/database/demand-calendar';

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── US Holiday + Restaurant Calendar ──────────────────────

interface HolidayResult {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
}

/**
 * Return US holiday/restaurant-significant date for a given date string.
 * Covers federal holidays + high-impact restaurant dates.
 */
export function detectHoliday(dateStr: string): HolidayResult | null {
  const date = new Date(dateStr + 'T12:00:00Z');
  const month = date.getUTCMonth() + 1; // 1-12
  const day = date.getUTCDate();
  const dow = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Helper: nth weekday of month
  function nthWeekday(n: number, weekday: number, m: number, y: number): number {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const firstDow = first.getUTCDay();
    const diff = (weekday - firstDow + 7) % 7;
    return 1 + diff + (n - 1) * 7;
  }

  // Helper: last weekday of month
  function lastWeekday(weekday: number, m: number, y: number): number {
    const last = new Date(Date.UTC(y, m, 0)); // last day of month
    const lastDow = last.getUTCDay();
    const diff = (lastDow - weekday + 7) % 7;
    return last.getUTCDate() - diff;
  }

  const year = date.getUTCFullYear();

  // ── Fixed date holidays ──
  if (month === 1 && day === 1) return { name: "New Year's Day", impact: 'negative' }; // people recover
  if (month === 2 && day === 14) return { name: "Valentine's Day", impact: 'positive' };
  if (month === 6 && day === 19) return { name: 'Juneteenth', impact: 'neutral' };
  if (month === 7 && day === 4) return { name: 'Independence Day', impact: 'positive' };
  if (month === 10 && day === 31) return { name: 'Halloween', impact: 'positive' };
  if (month === 11 && day === 11) return { name: "Veterans Day", impact: 'neutral' };
  if (month === 12 && day === 24) return { name: 'Christmas Eve', impact: 'positive' };
  if (month === 12 && day === 25) return { name: 'Christmas Day', impact: 'negative' }; // most closed
  if (month === 12 && day === 31) return { name: "New Year's Eve", impact: 'positive' };

  // ── Floating holidays ──
  // MLK Day: 3rd Monday of January
  if (month === 1 && dow === 1 && day === nthWeekday(3, 1, 1, year))
    return { name: 'MLK Day', impact: 'neutral' };

  // Presidents Day: 3rd Monday of February
  if (month === 2 && dow === 1 && day === nthWeekday(3, 1, 2, year))
    return { name: "Presidents Day", impact: 'neutral' };

  // Mother's Day: 2nd Sunday of May
  if (month === 5 && dow === 0 && day === nthWeekday(2, 0, 5, year))
    return { name: "Mother's Day", impact: 'positive' };

  // Memorial Day: last Monday of May
  if (month === 5 && dow === 1 && day === lastWeekday(1, 5, year))
    return { name: 'Memorial Day Weekend', impact: 'positive' };

  // Father's Day: 3rd Sunday of June
  if (month === 6 && dow === 0 && day === nthWeekday(3, 0, 6, year))
    return { name: "Father's Day", impact: 'positive' };

  // Labor Day: 1st Monday of September
  if (month === 9 && dow === 1 && day === nthWeekday(1, 1, 9, year))
    return { name: 'Labor Day', impact: 'positive' };

  // Columbus Day: 2nd Monday of October
  if (month === 10 && dow === 1 && day === nthWeekday(2, 1, 10, year))
    return { name: 'Columbus Day', impact: 'neutral' };

  // Thanksgiving: 4th Thursday of November
  if (month === 11 && dow === 4 && day === nthWeekday(4, 4, 11, year))
    return { name: 'Thanksgiving', impact: 'negative' }; // families eat at home

  // Day before Thanksgiving: big bar/social night
  if (month === 11 && dow === 3 && day === nthWeekday(4, 4, 11, year) - 1)
    return { name: 'Thanksgiving Eve', impact: 'positive' };

  return null;
}

// ── Claude Synthesis ───────────────────────────────────────

interface EnrichmentSignals {
  date: string;
  dayOfWeek: string;
  venueName: string;
  venueCity: string;
  holiday: HolidayResult | null;
  privateEvent: {
    type: string;
    guestCount: number | null;
    isBuyout: boolean;
    revenue: number | null;
  } | null;
}

interface ClaudeEnrichmentOutput {
  demand_multiplier: number;            // 0.5–1.8 range; 1.0 = baseline
  is_quiet_period: boolean;
  narrative: string;                    // 1-2 sentences, host-facing
  confidence: 'high' | 'medium' | 'low';
  open_pacing_recommended: boolean;
  lookahead_extension_days: number;     // 0, 30, or 60 extra days
  reasoning: string;                    // internal, not shown to hosts
}

async function claudeEnrichDate(signals: EnrichmentSignals): Promise<ClaudeEnrichmentOutput> {
  const dow = signals.dayOfWeek;
  const holiday = signals.holiday;
  const ev = signals.privateEvent;

  const prompt = `You are a restaurant demand forecasting analyst. Given the signals below, produce a demand modifier for ${signals.venueName} in ${signals.venueCity} on ${signals.date} (${dow}).

## SIGNALS

Holiday/Calendar: ${holiday ? `${holiday.name} (typical impact: ${holiday.impact})` : 'None detected'}

Private Event at Venue: ${ev
  ? `${ev.type}${ev.isBuyout ? ' (FULL BUYOUT)' : ''}, ~${ev.guestCount ?? 'unknown'} guests, $${ev.revenue?.toLocaleString() ?? 'unknown'} est. revenue`
  : 'None'}

## YOUR JOB

1. Reason about what is likely happening in ${signals.venueCity} on this date:
   - Known annual events (Coachella in LA April weekends, Art Basel Miami Dec, F1 Miami May, etc.)
   - Holidays and their real-world restaurant impact (Mother's Day = +demand, Thanksgiving = -demand)
   - Day-of-week baseline (Fri/Sat already baked in at 1.0 for prime time)
   - Buyouts reduce available dining capacity — factor that in

2. A "quiet period" means demand in the market will be meaningfully lower than baseline (e.g. Coachella empties LA).
   For quiet periods, set open_pacing_recommended=true and lookahead_extension_days=60 so we fill the book earlier.

3. For very high-demand dates (multiplier > 1.3), set lookahead_extension_days=30 to capture early bookings.

## OUTPUT FORMAT

Return valid JSON only, no markdown:
{
  "demand_multiplier": <number 0.5–1.8, 1.0 = baseline>,
  "is_quiet_period": <boolean>,
  "narrative": "<1-2 sentences for hosts, explaining what to expect and why>",
  "confidence": "high" | "medium" | "low",
  "open_pacing_recommended": <boolean>,
  "lookahead_extension_days": <0 | 30 | 60>,
  "reasoning": "<internal reasoning, 2-3 sentences>"
}

Rules:
- confidence=high only for well-known, recurring events (Thanksgiving, NYE, Coachella, Mother's Day)
- confidence=medium for plausible but not certain impacts
- confidence=low if you're estimating without clear signal
- If buyout: multiply dining room multiplier by 0.7 (less ambient dining)
- Be conservative: when uncertain, return multiplier=1.0, confidence=low`;

  const message = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    temperature: 0.1,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') {
    throw new Error('No response from Claude');
  }

  let raw = text.text.trim();
  if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  return JSON.parse(raw) as ClaudeEnrichmentOutput;
}

// ── Main Enricher ──────────────────────────────────────────

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface EnrichVenueOptions {
  orgId: string;
  venueId: string;
  venueName: string;
  venueCity: string;
  /** How many days out to enrich. Default 90. */
  lookaheadDays?: number;
  /** Re-enrich entries older than this many days. Default 7. */
  maxAgeDays?: number;
}

export interface EnrichVenueResult {
  enriched: number;
  skipped: number;
  errors: number;
}

/**
 * Enrich demand calendar for a venue across the next N days.
 * Skips dates already enriched within maxAgeDays.
 * Uses Tripleseat data already synced to demand_calendar.
 */
export async function enrichDemandCalendar(
  opts: EnrichVenueOptions,
): Promise<EnrichVenueResult> {
  const lookahead = opts.lookaheadDays ?? 90;
  const maxAge = opts.maxAgeDays ?? 7;

  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + lookahead * 86400000).toISOString().slice(0, 10);

  // Find dates that need enrichment
  const datesToEnrich = await getDatesNeedingEnrichment(
    opts.venueId,
    startDate,
    endDate,
    maxAge,
  );

  if (datesToEnrich.length === 0) {
    return { enriched: 0, skipped: 0, errors: 0 };
  }

  // Fetch existing demand_calendar rows (for Tripleseat data already synced)
  const { getDemandCalendarRange } = await import('@/lib/database/demand-calendar');
  const existing = await getDemandCalendarRange(opts.venueId, startDate, endDate);
  const existingMap = new Map(existing.map((e) => [e.business_date, e]));

  const upserts: DemandCalendarUpsert[] = [];
  let errors = 0;
  const enrichOneDate = async (date: string): Promise<{ row: DemandCalendarUpsert; errored: boolean }> => {
    const d = new Date(date + 'T12:00:00Z');
    const dow = DAYS_OF_WEEK[d.getUTCDay()];
    const holiday = detectHoliday(date);
    const existing_row = existingMap.get(date);

    // Build private event signal from Tripleseat-synced data
    const privateEvent = existing_row?.has_private_event
      ? {
          type: existing_row.private_event_type || 'private_event',
          guestCount: existing_row.private_event_guest_count,
          isBuyout: existing_row.private_event_is_buyout,
          revenue: existing_row.private_event_revenue,
        }
      : null;

    const signals: EnrichmentSignals = {
      date,
      dayOfWeek: dow,
      venueName: opts.venueName,
      venueCity: opts.venueCity,
      holiday,
      privateEvent,
    };

    try {
      const result = await claudeEnrichDate(signals);
      return {
        errored: false,
        row: {
          org_id: opts.orgId,
          venue_id: opts.venueId,
          business_date: date,
          is_holiday: holiday !== null,
          holiday_name: holiday?.name ?? null,
          holiday_impact: holiday?.impact ?? null,
          has_private_event: existing_row?.has_private_event ?? false,
          private_event_type: existing_row?.private_event_type ?? null,
          private_event_guest_count: existing_row?.private_event_guest_count ?? null,
          private_event_revenue: existing_row?.private_event_revenue ?? null,
          private_event_is_buyout: existing_row?.private_event_is_buyout ?? false,
          demand_multiplier: Math.max(0.5, Math.min(1.8, result.demand_multiplier)),
          is_quiet_period: result.is_quiet_period,
          narrative: result.narrative,
          confidence: result.confidence,
          raw_signals: {
            holiday,
            private_event: privateEvent,
            claude_reasoning: result.reasoning,
          },
          open_pacing_recommended: result.open_pacing_recommended,
          lookahead_extension_days: result.lookahead_extension_days,
          tripleseat_synced_at: existing_row?.tripleseat_synced_at ?? null,
          ai_enriched_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      console.error(`[demand-calendar] Failed to enrich ${date} for venue ${opts.venueId}:`, err);
      return {
        errored: true,
        row: {
          org_id: opts.orgId,
          venue_id: opts.venueId,
          business_date: date,
          is_holiday: holiday !== null,
          holiday_name: holiday?.name ?? null,
          holiday_impact: holiday?.impact ?? null,
          has_private_event: existing_row?.has_private_event ?? false,
          private_event_type: existing_row?.private_event_type ?? null,
          private_event_guest_count: existing_row?.private_event_guest_count ?? null,
          private_event_revenue: existing_row?.private_event_revenue ?? null,
          private_event_is_buyout: existing_row?.private_event_is_buyout ?? false,
          demand_multiplier: holiday?.impact === 'positive' ? 1.15 : holiday?.impact === 'negative' ? 0.85 : 1.0,
          is_quiet_period: false,
          narrative: holiday ? `${holiday.name} — expect ${holiday.impact} demand impact.` : null,
          confidence: 'low',
          raw_signals: { holiday, error: String(err) },
          open_pacing_recommended: false,
          lookahead_extension_days: 0,
          tripleseat_synced_at: existing_row?.tripleseat_synced_at ?? null,
          ai_enriched_at: new Date().toISOString(),
        },
      };
    }
  };

  // Bound concurrency so we don't serialize 90+ model calls or overload provider rate limits.
  const concurrency = 5;
  for (let i = 0; i < datesToEnrich.length; i += concurrency) {
    const batch = datesToEnrich.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((date) => enrichOneDate(date)));
    for (const result of batchResults) {
      upserts.push(result.row);
      if (result.errored) errors++;
    }
  }

  const enriched = await upsertDemandCalendar(upserts);
  const skipped = (lookahead + 1) - datesToEnrich.length;

  console.log(
    `[demand-calendar] ${opts.venueName}: enriched ${enriched} dates, skipped ${skipped}, ${errors} errors`,
  );

  return { enriched, skipped, errors };
}
