/**
 * AI-Powered Pacing Optimization Agent
 *
 * Analyzes reservation patterns, demand signals, and historical data
 * to recommend pacing adjustments that maximize covers and revenue.
 *
 * Pattern: lib/ai/comp-reviewer.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SevenRoomsShift, WidgetShiftData } from '@/lib/integrations/sevenrooms';
import type { SevenRoomsVenueSettings } from '@/lib/database/sevenrooms-settings';
import type { ReservationAccessRule } from '@/lib/database/reservations';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Types ────────────────────────────────────────────────────────

export interface PacingOptimizerInput {
  venueName: string;
  date: string;
  dayOfWeek: string;

  // Current SR configuration (legacy — used when native rules not available)
  currentShifts: SevenRoomsShift[];
  currentOverrides: Pick<
    SevenRoomsVenueSettings,
    'covers_per_interval' | 'custom_pacing' | 'interval_minutes' | 'turn_time_overrides'
  > | null;

  // Native access rules (preferred — replaces currentShifts + currentOverrides)
  nativeAccessRules?: ReservationAccessRule[];

  // Reservation snapshot
  reservations: {
    totalCovers: number;
    confirmed: number;
    pending: number;
    cancelled: number;
    bySlot: Array<{
      label: string;
      coversBooked: number;
      pacingLimit: number | null;
      tablesBooked: number;
      tablesAvailable: number;
    }>;
  };

  // Historical context
  historicalNoShowRate: number;
  historicalTurnTimes: Record<string, number>; // table bucket → avg minutes
  demandSignals: { cancellations: number; noShows: number; walkIns: number };

  // Sales context
  salesPace: {
    currentRevenue: number | null;
    forecastedRevenue: number | null;
    sdlwRevenue: number | null;
    avgRevenuePerCover: number | null;
  };

  // Utilization
  utilization: {
    peakUtilizationPct: number;
    avgTurnMinutes: number;
    lostRevenue: {
      fromGaps: number;
      fromDeadSeats: number;
      demandConstrained: number;
    } | null;
  };

  // Live access rule data from widget API (real-time channel allocation)
  widgetAccessRules: WidgetShiftData[] | null;
}

export interface PacingRecommendationItem {
  type: 'covers' | 'pacing' | 'turn_time' | 'channel';
  slot: string | null; // null = global change; for channel: the rule description
  currentValue: number;
  recommendedValue: number;
  reasoning: string;
  expectedImpact: { extraCovers: number; revenueDelta: number };
  confidence: 'high' | 'medium' | 'low';
  /** For channel recommendations: identifies the access rule */
  channelRule?: string;
}

export interface PacingOptimizerOutput {
  assessment: string;
  recommendations: PacingRecommendationItem[];
  riskFactors: string[];
}

// ── Main Function ────────────────────────────────────────────────

export async function optimizePacing(
  input: PacingOptimizerInput,
): Promise<PacingOptimizerOutput> {
  const prompt = buildPrompt(input);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  let raw = textContent.text.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  return JSON.parse(raw) as PacingOptimizerOutput;
}

// ── Access Rule Summary Builder ──────────────────────────────────

function buildAccessRuleSummary(widgetData: WidgetShiftData[] | null): string {
  if (!widgetData || widgetData.length === 0) return '';

  const lines: string[] = [];

  for (const shift of widgetData) {
    lines.push(`Shift: ${shift.shiftName}`);

    if (shift.accessRules.length === 0) {
      lines.push('  No access rules with pacing attached (all slots are request-only)');
    }

    for (const rule of shift.accessRules) {
      const desc = rule.description || 'Unnamed rule';
      const area = rule.seatingAreaId ? 'Specific area' : 'All areas';
      lines.push(`  Rule: ${desc}`);
      lines.push(`    Pacing: ${rule.pacingLimit ?? 'unlimited'}/slot | Area: ${area} | Exclusive: ${rule.isExclusive}`);
      if (rule.serviceCharge > 0 || rule.gratuity > 0 || rule.minSpend) {
        lines.push(`    Fees: svc ${rule.serviceCharge}% + grat ${rule.gratuity}% | Min spend: ${rule.minSpend ? '$' + rule.minSpend : 'none'}`);
      }

      // Show capacity utilization across slots
      const slotsWithRemaining = rule.slots.filter(s => s.coversRemaining !== null);
      if (slotsWithRemaining.length > 0) {
        const totalCapacity = slotsWithRemaining.length * (rule.pacingLimit ?? 0);
        const totalRemaining = slotsWithRemaining.reduce((s, sl) => s + (sl.coversRemaining ?? 0), 0);
        const totalBooked = totalCapacity - totalRemaining;
        const utilizationPct = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;
        lines.push(`    Slots: ${slotsWithRemaining.length} bookable | ${totalBooked}/${totalCapacity} covers booked (${utilizationPct}% utilized)`);

        // Show tight/full slots
        const tightSlots = slotsWithRemaining.filter(s => (s.coversRemaining ?? 0) <= 5 && (s.coversRemaining ?? 0) > 0);
        const fullSlots = slotsWithRemaining.filter(s => (s.coversRemaining ?? 0) === 0);
        if (fullSlots.length > 0) lines.push(`    FULL slots: ${fullSlots.map(s => s.time).join(', ')}`);
        if (tightSlots.length > 0) lines.push(`    Tight slots (<5 rem): ${tightSlots.map(s => `${s.time}(${s.coversRemaining})`).join(', ')}`);
      }
    }

    if (shift.requestOnlySlots.length > 0) {
      lines.push(`  Request-only slots (${shift.requestOnlySlots.length}): ${shift.requestOnlySlots.slice(0, 6).join(', ')}${shift.requestOnlySlots.length > 6 ? '...' : ''}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ── Native Access Rules Summary ──────────────────────────────────

function buildNativeRuleSummary(rules: ReservationAccessRule[]): string {
  if (!rules || rules.length === 0) return '';

  const lines: string[] = [];
  for (const rule of rules) {
    lines.push(`Rule: ${rule.name} (${rule.shift_type})`);
    lines.push(`  Window: ${rule.start_time} – ${rule.end_time}`);
    lines.push(`  Pacing: ${rule.max_covers_per_interval} covers/${rule.interval_minutes}min`);
    lines.push(`  Party size: ${rule.min_party_size}–${rule.max_party_size}`);
    lines.push(`  AI managed: ${rule.ai_managed ? 'YES' : 'no'}`);

    if (rule.custom_pacing && Object.keys(rule.custom_pacing).length > 0) {
      lines.push(`  Custom pacing: ${Object.entries(rule.custom_pacing).map(([k, v]) => `${k}→${v}`).join(', ')}`);
    }

    if (rule.turn_times && Object.keys(rule.turn_times).length > 0) {
      lines.push(`  Turn times: ${Object.entries(rule.turn_times).map(([k, v]) => `${k === '-1' ? 'default' : k + 'p'}=${v}m`).join(', ')}`);
    }

    if (rule.channel_allocation && Object.keys(rule.channel_allocation).length > 0) {
      lines.push(`  Channel allocation: ${Object.entries(rule.channel_allocation).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }

    if (rule.min_spend) lines.push(`  Min spend: $${rule.min_spend}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Prompt Builder ───────────────────────────────────────────────

function buildPrompt(input: PacingOptimizerInput): string {
  // Prefer native access rules; fall back to SR shifts
  const hasNativeRules = input.nativeAccessRules && input.nativeAccessRules.length > 0;

  let configSection: string;

  if (hasNativeRules) {
    const nativeRuleSummary = buildNativeRuleSummary(input.nativeAccessRules!);
    configSection = `## CURRENT ACCESS RULES (OpSOS-Native — Directly Modifiable)
${nativeRuleSummary}
Note: Rules marked "AI managed: YES" can be adjusted directly by your recommendations.
Rules marked "AI managed: no" require manual review before changes are applied.`;
  } else {
    const primaryShift = input.currentShifts[0];
    const srCovers = primaryShift?.covers_per_seating_interval;
    const srInterval = primaryShift?.interval_minutes;
    const srTurns = primaryShift?.duration_minutes_by_party_size || {};
    const overrideCovers = input.currentOverrides?.covers_per_interval;
    const effectiveCovers = overrideCovers ?? srCovers ?? 'unknown';

    configSection = `## CURRENT CONFIGURATION
- Shift: ${primaryShift?.name ?? 'Unknown'}
- Covers per interval: ${effectiveCovers} (SR default: ${srCovers ?? 'N/A'}, OpSOS override: ${overrideCovers ?? 'none'})
- Interval: ${srInterval ?? 30} minutes
- Turn times: ${Object.entries(srTurns).map(([k, v]) => `${k === '-1' ? 'default' : k + 'p'}=${v}m`).join(', ') || 'not set'}`;
  }

  // Build slot table
  const slotRows = input.reservations.bySlot
    .map(s => `  ${s.label}: ${s.coversBooked} booked / ${s.pacingLimit ?? '?'} limit, ${s.tablesAvailable} tables avail`)
    .join('\n');

  // Build access rule summary from widget data
  const accessRuleLines = buildAccessRuleSummary(input.widgetAccessRules);

  return `You are an AI pacing optimization agent for ${input.venueName}.

Your job: analyze the reservation book for ${input.date} (${input.dayOfWeek}) and recommend pacing adjustments that maximize covers and revenue per seat-hour while maintaining service quality.

${configSection}

## RESERVATION SNAPSHOT
- Total covers: ${input.reservations.totalCovers} (${input.reservations.confirmed} confirmed, ${input.reservations.pending} pending, ${input.reservations.cancelled} cancelled)
- By slot:
${slotRows || '  No slot data available'}

## HISTORICAL CONTEXT
- No-show rate: ${(input.historicalNoShowRate * 100).toFixed(1)}% (${input.dayOfWeek}s)
- Demand signals: ${input.demandSignals.cancellations} cancellations, ${input.demandSignals.noShows} no-shows, ${input.demandSignals.walkIns} walk-ins (recent history)
- Historical turn times: ${Object.entries(input.historicalTurnTimes).map(([k, v]) => `${k}=${Math.round(v)}m`).join(', ') || 'N/A'}

## UTILIZATION
- Peak utilization: ${input.utilization.peakUtilizationPct}%
- Avg turn: ${Math.round(input.utilization.avgTurnMinutes)} minutes
${input.utilization.lostRevenue ? `- Lost revenue: $${input.utilization.lostRevenue.fromGaps.toFixed(0)} from gaps, $${input.utilization.lostRevenue.fromDeadSeats.toFixed(0)} from dead seats, $${input.utilization.lostRevenue.demandConstrained.toFixed(0)} demand-constrained` : ''}

## SALES CONTEXT
${input.salesPace.avgRevenuePerCover ? `- Avg revenue per cover: $${input.salesPace.avgRevenuePerCover.toFixed(0)}` : ''}
${input.salesPace.forecastedRevenue ? `- Forecasted revenue: $${input.salesPace.forecastedRevenue.toFixed(0)}` : ''}
${input.salesPace.sdlwRevenue ? `- Same day last week: $${input.salesPace.sdlwRevenue.toFixed(0)}` : ''}

## LIVE ACCESS RULES (Real-Time Channel Allocation from SevenRooms Widget)
${accessRuleLines || 'No access rule data available — widget API returned no bookable slots.'}

## RULES
1. Never recommend reducing pacing below current bookings for any slot.
2. Only increase pacing if no-show history or available tables justify it.
3. Turn time adjustments must stay within ±20% of current values.
4. Factor in the day of week — weekends typically have higher demand.
5. If the book looks healthy (high utilization, no demand constraints), recommend no changes.
6. Be conservative with "high" confidence. Use "high" only when data clearly supports the recommendation.
7. For "channel" recommendations: analyze how covers are distributed across access rules (booking channels like Widget, Rolodex, Dorsia). If one channel is nearly full while another has excess capacity, recommend rebalancing. Use currentValue/recommendedValue for the pacing limit per slot on that channel.

## OUTPUT FORMAT
Return valid JSON with this exact structure (no markdown, no extra text):
{
  "assessment": "One paragraph overall assessment of the book and pacing",
  "recommendations": [
    {
      "type": "covers" | "pacing" | "turn_time" | "channel",
      "slot": "7:00 PM" | null,
      "currentValue": <number>,
      "recommendedValue": <number>,
      "reasoning": "Concise explanation",
      "expectedImpact": { "extraCovers": <number>, "revenueDelta": <number> },
      "confidence": "high" | "medium" | "low",
      "channelRule": "Rule description (only for type=channel)"
    }
  ],
  "riskFactors": ["Array of warnings or caveats"]
}

For type="channel": slot is the time range affected (e.g. "6:30-8:00 PM"), currentValue/recommendedValue are the pacing limits, and channelRule identifies which access rule to adjust (e.g. "Dinner" or "Dinner Patio").${hasNativeRules ? ' High-confidence recommendations on AI-managed rules will be applied automatically.' : ' These are advisory — managers must apply them in the SR admin portal.'}

If no changes are needed, return empty recommendations array with an assessment explaining why.`;
}
