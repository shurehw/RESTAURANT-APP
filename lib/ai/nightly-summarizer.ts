/**
 * lib/ai/nightly-summarizer.ts
 * Generates short AI summaries per venue for the nightly report email.
 * Batches all venues into a single Claude call for efficiency.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { VenueReport } from '@/lib/email/nightly-report-template';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface VenueSummaryResult {
  venueId: string;
  summary: string;
}

/**
 * Generate a 1-2 sentence AI summary for each venue based on its nightly data.
 * Returns a Map of venueId → summary string.
 */
export async function generateVenueSummaries(
  venues: VenueReport[],
  businessDate: string
): Promise<Map<string, string>> {
  const summaryMap = new Map<string, string>();

  if (venues.length === 0) return summaryMap;

  // Build venue data for the prompt
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
    if (!textContent || textContent.type !== 'text') {
      console.error('[nightly-summarizer] No text response from AI');
      return summaryMap;
    }

    let raw = textContent.text.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const results: VenueSummaryResult[] = JSON.parse(raw);

    for (const r of results) {
      summaryMap.set(r.venueId, r.summary);
    }
  } catch (err: any) {
    console.error('[nightly-summarizer] Failed to generate summaries:', err.message);
    // Non-critical — email sends without summaries
  }

  return summaryMap;
}
