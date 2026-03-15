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

interface KpiData {
  netSales: number;
  covers: number;
  totalComps: number;
  laborCost: number;
  laborPct: number;
  compBreakdown?: CompBreakdown[];
  compDetails?: CompDetail[];
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

  // Build comp detail context (top comps with item-level detail)
  let compDetailContext = '';
  if (hasFullKpi && kpiData!.compDetails && kpiData!.compDetails.length > 0) {
    const topComps = kpiData!.compDetails
      .sort((a, b) => b.compTotal - a.compTotal)
      .slice(0, 8); // Top 8 comps by dollar amount
    const lines = topComps.map(c => {
      const itemStr = c.items.length > 0 ? ` — Items: ${c.items.join(', ')}` : '';
      return `  $${Math.round(c.compTotal)} comp on $${Math.round(c.checkTotal)} check | ${c.reason} | Server: ${c.server}${itemStr}`;
    });
    compDetailContext = `\nComp Details (top ${topComps.length} by amount):\n${lines.join('\n')}`;
  }

  const kpiContext = hasFullKpi
    ? `KPI DATA (full-day totals from POS):
Net Sales: $${Math.round(kpiData!.netSales).toLocaleString()}
Covers: ${kpiData!.covers}
${kpiData!.totalComps > 0 ? `Total Comps: $${Math.round(kpiData!.totalComps).toLocaleString()} (${compPct}% of net sales)${compBreakdownContext}${compDetailContext}` : ''}
${kpiData!.laborCost > 0 ? `Labor Cost: $${Math.round(kpiData!.laborCost).toLocaleString()} (${kpiData!.laborPct.toFixed(1)}%)` : ''}
`
    : '';

  const prompt = `You are an operations analyst for a high-end restaurant group. Given a venue's manager notes from their nightly report email plus KPI data for ${businessDate}, produce a structured operational narrative.

VENUE: ${venueName}
DATE: ${businessDate}

${kpiContext}

MANAGER NOTES FROM NIGHTLY EMAIL:
${sectionEntries}

FORMAT YOUR RESPONSE EXACTLY LIKE THIS (use these exact section headers and bullet points with the bullet character):

REVENUE & COMPS
• [Revenue observation with specific numbers]
• [Comp/discount observation if relevant]

GUEST
• [Notable guests, VIPs, people of note mentioned in the notes]
• [Cover count observations if mentioned]
• [High spender observations if available]

KITCHEN
• [Kitchen notes if any were provided]
• [Food quality or operational notes]

ACTION ITEMS
• [Any follow-up items identified from the notes]

RULES:
- Use ONLY the section headers above (REVENUE & COMPS, GUEST, KITCHEN, ACTION ITEMS)
- Each bullet MUST start with the bullet character followed by a space
- If KPI DATA is provided, use those numbers for revenue/covers/comps/labor in REVENUE & COMPS
- If no KPI DATA is provided, use any revenue/cover numbers from the manager notes
- NEVER compare manager-reported numbers against KPI data. NEVER flag discrepancies. NEVER suggest "reconciling" numbers. They come from different sources and shifts — both are valid.
- NEVER put "reconcile", "discrepancy", "variance", or "investigate reporting" in ACTION ITEMS
- If labor cost is $0 or not provided, do not mention labor at all
- If comps are $0 or not provided, do not mention comps at all — do NOT say "no comps" or "zero comps"
- If comp % is above 3%, flag it in REVENUE & COMPS as elevated and note the dollar amount
- If Comp Breakdown by Reason is provided, mention the top 1-2 reasons by dollar amount in REVENUE & COMPS (e.g. "Comps led by VIP/Owner ($X) and Kitchen Error ($Y)")
- If Comp Details are provided, look for patterns worth flagging in ACTION ITEMS:
  - Multiple comps by the same server (possible training issue or abuse)
  - Food items comped repeatedly (possible kitchen/quality issue — name the item)
  - Large single comps (>$200) without a clear reason
  - Beverage-heavy comps (possible service recovery or unauthorized pours)
- When mentioning comped items, name the specific menu items — this helps operators identify recurring quality or service problems
- Use manager notes for QUALITATIVE context: guest names, operational observations, kitchen notes, action items
- In the COVER COUNT and top checks data, names followed by "Server" (e.g., "Irvin Serrano Server") are STAFF (servers/waiters), NOT guests. Do NOT list them as notable guests. Only list names from PEOPLE WE KNOW as notable guests.
- Names in SPENDERS OVER sections are real guest names (high spenders) — include them in GUEST section as notable spenders
- SERVICE FLAGS section (if present) contains potential service concerns extracted from check data (zero tips, low tips on high-spend checks). Include these in ACTION ITEMS as service follow-ups — they may indicate food quality issues, service problems, or billing disputes worth investigating
- If a section has no relevant data from the notes, include one bullet with "No notes reported"
- Be direct and concise — restaurant industry language
- Do NOT add sections not listed above
- Do NOT use emojis
- Do NOT include a title line or header — start directly with the first section`;

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
