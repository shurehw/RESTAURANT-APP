/**
 * lib/ai/manager-notes-narrator.ts
 * Takes parsed manager email notes + venue KPI data and generates
 * a structured closing_narrative (same format as attestation narratives).
 */

import Anthropic from '@anthropic-ai/sdk';

interface KpiData {
  netSales: number;
  covers: number;
  totalComps: number;
  laborCost: number;
  laborPct: number;
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

  const kpiContext = kpiData
    ? `KPI DATA:
Net Sales: $${Math.round(kpiData.netSales).toLocaleString()}
Covers: ${kpiData.covers}
Total Comps: $${Math.round(kpiData.totalComps).toLocaleString()}
Labor Cost: $${Math.round(kpiData.laborCost).toLocaleString()} (${kpiData.laborPct.toFixed(1)}%)
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
- KPI DATA is the authoritative source for revenue, covers, comps, and labor — use those numbers in REVENUE & COMPS
- Manager notes may cover only ONE shift (e.g., dinner only) at venues that run multiple dayparts (brunch + dinner). Do NOT compare or flag discrepancies between manager-reported numbers and KPI data — KPI data is full-day and always correct
- If the manager notes mention revenue or cover numbers, ignore them in favor of KPI data
- Use manager notes for QUALITATIVE context: guest names, operational observations, kitchen notes, action items
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
