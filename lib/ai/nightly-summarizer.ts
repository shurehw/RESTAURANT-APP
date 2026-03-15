/**
 * lib/ai/nightly-summarizer.ts
 * Provides per-venue summaries for the nightly report email.
 *
 * Three-tier resolution:
 * 1. closing_narrative from nightly_attestations (attestation flow)
 * 2. closing_narrative from manager_email_notes (parsed from Lightspeed/Wynn emails)
 * 3. AI fallback: generates a short summary from KPI data via Claude
 */

import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase/service';
import type { VenueReport } from '@/lib/email/nightly-report-template';

interface VenueSummaryResult {
  venueId: string;
  summary: string;
}

/**
 * Fetch closing_narrative from submitted nightly_attestations.
 */
async function fetchAttestationNarratives(
  venueIds: string[],
  businessDate: string
): Promise<Map<string, string>> {
  const supabase = getServiceClient();
  const map = new Map<string, string>();

  const { data, error } = await (supabase as any)
    .from('nightly_attestations')
    .select('venue_id, closing_narrative')
    .in('venue_id', venueIds)
    .eq('business_date', businessDate)
    .eq('status', 'submitted')
    .not('closing_narrative', 'is', null);

  if (error || !data) return map;

  for (const row of data) {
    if (row.closing_narrative?.trim()) {
      map.set(row.venue_id, row.closing_narrative.trim());
    }
  }

  return map;
}

/**
 * Fetch closing_narrative from manager_email_notes (parsed from nightly digest emails).
 */
async function fetchManagerEmailNarratives(
  venueIds: string[],
  businessDate: string
): Promise<Map<string, string>> {
  const supabase = getServiceClient();
  const map = new Map<string, string>();

  const { data, error } = await (supabase as any)
    .from('manager_email_notes')
    .select('venue_id, closing_narrative')
    .in('venue_id', venueIds)
    .eq('business_date', businessDate)
    .not('closing_narrative', 'is', null);

  if (error || !data) return map;

  for (const row of data) {
    if (row.closing_narrative?.trim()) {
      map.set(row.venue_id, row.closing_narrative.trim());
    }
  }

  return map;
}

/**
 * AI fallback for venues without an attestation narrative.
 */
async function generateFallbackSummaries(
  venues: VenueReport[],
  businessDate: string
): Promise<Map<string, string>> {
  const summaryMap = new Map<string, string>();
  if (venues.length === 0) return summaryMap;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const venueData = venues.map((v) => {
    const s = v.report.summary;
    const avgCheck = s.total_checks > 0 ? s.net_sales / s.total_checks : 0;
    const compPct = s.net_sales > 0 ? (s.total_comps / (s.net_sales + s.total_comps)) * 100 : 0;

    return {
      venueId: v.venueId,
      venueName: v.venueName,
      net_sales: Math.round(s.net_sales),
      total_checks: s.total_checks,
      total_covers: s.total_covers,
      avg_check: Math.round(avgCheck),
      total_comps: Math.round(s.total_comps),
      comp_pct: Math.round(compPct * 10) / 10,
      categories: (v.report.salesByCategory || []).map((c) => ({
        category: c.category,
        net_sales: Math.round(c.net_sales),
      })),
      labor: v.laborData
        ? {
            labor_pct: Math.round(v.laborData.labor_pct * 10) / 10,
            labor_cost: Math.round(v.laborData.labor_cost),
            employee_count: v.laborData.employee_count,
          }
        : null,
    };
  });

  const prompt = `You are an operations analyst for a restaurant group. Given each venue's nightly performance data for ${businessDate}, write a concise 1-2 sentence summary highlighting the most notable takeaway (strong sales, high comps, labor efficiency, category mix, etc.). Be direct and specific with numbers. No fluff.

Venue data:
${JSON.stringify(venueData, null, 2)}

Return a JSON array with this exact structure:
[
  { "venueId": "...", "summary": "..." }
]

Rules:
- Each summary must be 1-2 sentences max
- Reference specific numbers (e.g. "$45K net", "4.2% comp rate")
- Use restaurant industry language
- If a venue has $0 sales, say "Closed" or "No activity"
- Do NOT use emojis`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = message.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') return summaryMap;

    let raw = textContent.text.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const results: VenueSummaryResult[] = JSON.parse(raw);
    for (const r of results) {
      summaryMap.set(r.venueId, r.summary);
    }
  } catch (err: any) {
    console.error('[nightly-summarizer] Fallback generation failed:', err.message);
  }

  return summaryMap;
}

/**
 * Get per-venue summaries for the nightly report email.
 * Uses attestation closing_narrative first, falls back to AI generation.
 */
export async function generateVenueSummaries(
  venues: VenueReport[],
  businessDate: string
): Promise<Map<string, string>> {
  const summaryMap = new Map<string, string>();
  if (venues.length === 0) return summaryMap;

  // 1. Pull closing_narrative from attestations
  const venueIds = venues.map((v) => v.venueId);
  const attestNarratives = await fetchAttestationNarratives(venueIds, businessDate);
  for (const [venueId, narrative] of attestNarratives) {
    summaryMap.set(venueId, narrative);
  }

  console.log(
    `[nightly-summarizer] ${attestNarratives.size}/${venues.length} venues have attestation narratives`
  );

  // 2. Pull closing_narrative from manager_email_notes for remaining venues
  const missingAfterAttest = venues.filter((v) => !summaryMap.has(v.venueId));
  if (missingAfterAttest.length > 0) {
    const emailNarratives = await fetchManagerEmailNarratives(
      missingAfterAttest.map((v) => v.venueId),
      businessDate
    );
    for (const [venueId, narrative] of emailNarratives) {
      summaryMap.set(venueId, narrative);
    }
    if (emailNarratives.size > 0) {
      console.log(
        `[nightly-summarizer] ${emailNarratives.size} venues have manager email narratives`
      );
    }
  }

  // 3. AI fallback for venues still without narrative
  const missing = venues.filter((v) => !summaryMap.has(v.venueId));
  if (missing.length > 0) {
    const fallback = await generateFallbackSummaries(missing, businessDate);
    for (const [venueId, summary] of fallback) {
      summaryMap.set(venueId, summary);
    }
  }

  return summaryMap;
}
