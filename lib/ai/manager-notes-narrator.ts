/**
 * lib/ai/manager-notes-narrator.ts
 * Takes parsed manager email notes + venue KPI data and generates
 * a structured closing_narrative (same format as attestation narratives).
 */

import Anthropic from '@anthropic-ai/sdk';

interface CompBreakdown {
  reason: string;
  qty: number;
  amount: number;
}

interface CompDetail {
  server: string;
  compTotal: number;
  checkTotal: number;
  reason: string;
  items: string[]; // e.g. "Truffle Fries ($18.00)", "Cocktail x2 ($36.00)"
}

interface CompItemTrend {
  itemName: string;
  compCount: number;
  totalNights: number;
  compRate: number;       // % of nights comped
  topReasons: string[];
}

interface CompTrends {
  windowDays: number;
  activeDays: number;
  avgDailyCompPct: number;
  avgDailyCompTotal: number;
  problemItems: CompItemTrend[];
}

interface KpiData {
  netSales: number;
  covers: number;
  totalComps: number;
  laborCost: number;
  laborPct: number;
  compBreakdown?: CompBreakdown[];
  compDetails?: CompDetail[];
  compTrends?: CompTrends | null;
}

/**
 * Generate a structured narrative from manager email notes + KPI data.
 * Output format matches attestation closing_narrative:
 * Section headers (REVENUE & COMPS, GUEST, KITCHEN, ACTION ITEMS)
 * with bullet points using the bullet marker.
 */
export async function generateNarrativeFromNotes(
  venueName: string,
  businessDate: string,
  sections: Record<string, string>,
  kpiData: KpiData | null
): Promise<string | null> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build the context from parsed sections
  const sectionEntries = Object.entries(sections)
    .map(([key, value]) => `${key.toUpperCase().replace(/_/g, ' ')}: ${value}`)
    .join('\n\n');

  // Only include KPI data when it's meaningful (non-zero sales)
  // Avero venues (Vegas, Harriets) have limited KPI data — manager notes are the primary source
  const hasFullKpi = kpiData && kpiData.netSales > 0 && kpiData.covers > 0;
  const compPct = hasFullKpi && kpiData!.totalComps > 0
    ? ((kpiData!.totalComps / kpiData!.netSales) * 100).toFixed(1)
    : null;
  // Build comp breakdown context
  let compBreakdownContext = '';
  if (hasFullKpi && kpiData!.totalComps > 0 && kpiData!.compBreakdown && kpiData!.compBreakdown.length > 0) {
    const lines = kpiData!.compBreakdown
      .filter(c => c.amount > 0)
      .map(c => `  ${c.reason}: $${Math.round(c.amount).toLocaleString()} (${c.qty} check${c.qty !== 1 ? 's' : ''})`);
    if (lines.length > 0) {
      compBreakdownContext = `\nComp Breakdown by Reason:\n${lines.join('\n')}`;
    }
  }

  // Comp detail context — keep minimal (top reason only, no item dump)
  const compDetailContext = '';

  // Build multi-day comp trend context — keep minimal, only flag recurring items
  let compTrendContext = '';
  if (kpiData?.compTrends && kpiData.compTrends.problemItems.length > 0) {
    const t = kpiData.compTrends;
    // Only include top 3 recurring items as brief notes
    const top3 = t.problemItems.slice(0, 3);
    const lines = top3.map(item =>
      `  ${item.itemName}: ${item.compRate}% comp rate over ${t.activeDays} nights`
    );
    compTrendContext = `\nRecurring comp items (background context only — do NOT list these in output):\n${lines.join('\n')}`;
  }

  const kpiContext = hasFullKpi
    ? `KPI DATA (full-day totals from POS):
Net Sales: $${Math.round(kpiData!.netSales).toLocaleString()}
Covers: ${kpiData!.covers}
${kpiData!.totalComps > 0 ? `Total Comps: $${Math.round(kpiData!.totalComps).toLocaleString()} (${compPct}% of net sales)${compBreakdownContext}${compDetailContext}` : ''}
${kpiData!.laborCost > 0 ? `Labor Cost: $${Math.round(kpiData!.laborCost).toLocaleString()} (${kpiData!.laborPct.toFixed(1)}%)` : ''}${compTrendContext}
`
    : (compTrendContext ? compTrendContext + '\n' : '');

  const prompt = `You are an operations analyst for a high-end restaurant group. Given a venue's manager notes from their nightly report email plus KPI data for ${businessDate}, produce a structured operational narrative.

VENUE: ${venueName}
DATE: ${businessDate}

${kpiContext}

MANAGER NOTES FROM NIGHTLY EMAIL:
${sectionEntries}

FORMAT YOUR RESPONSE USING THESE EXACT SECTION HEADERS:

REVENUE & COMPS
1-2 sentences: net sales, covers, comp total and %, top comp reason. If comp % is above 3%, note it as elevated.

GUEST
1-2 sentences: notable guests, cover count, high spenders.

KITCHEN
1 sentence: kitchen notes or "No notes reported."

ACTION ITEMS
• Top operational issue flagged tonight (service, staffing, kitchen, guest complaint, etc.)
• Another issue if applicable
• Max 3 items — cover the MOST IMPORTANT issues across all areas, not just comps

RULES:
- Use ONLY the section headers above
- REVENUE & COMPS, GUEST, and KITCHEN use plain sentences — no bullets
- ACTION ITEMS: each item starts with • (bullet character) on its own line. Max 3 items, one sentence each.
- ACTION ITEMS must cover the top operational issues — service flags, kitchen problems, staffing gaps, guest complaints, facility issues. Comps are already covered in REVENUE & COMPS so do NOT repeat comp details in action items unless there is a specific recurring pattern that needs manager attention.
- REVENUE & COMPS: keep it brief — total comps, comp %, top 1 reason by dollar amount. Do NOT list every comp detail or every server's comps.
- If KPI DATA is provided, use those numbers
- If no KPI DATA, use numbers from manager notes
- NEVER compare manager-reported numbers against KPI data
- If labor cost is $0, do not mention labor
- If comps are $0, do not mention comps
- Names followed by "Server" are STAFF, NOT guests
- Names in SPENDERS OVER sections are guest names — include in GUEST
- SERVICE FLAGS go in ACTION ITEMS as service follow-ups
- Be direct and concise — restaurant industry language
- Keep the TOTAL response under 150 words
- Do NOT use emojis
- Start directly with the first section`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    return textBlock.text.trim();
  } catch (err: any) {
    console.error(
      `[manager-notes-narrator] Failed for ${venueName}:`,
      err.message
    );
    return null;
  }
}
