/**
 * lib/ai/drill-insights.ts
 * AI pattern recognition for nightly drill-through pages.
 * Analyzes section-specific data and returns actionable insights.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface DrillInsight {
  pattern: string;       // Short label: "Repeat Comp Pattern", "Service Flag"
  detail: string;        // 1-2 sentence explanation with specific numbers
  action: string;        // Concrete next step: "Pull server aside", "Review with chef"
  severity: 'high' | 'medium' | 'low';
}

interface DrillInsightInput {
  section: string;
  venueName: string;
  date: string;
  data: Record<string, unknown>;
}

const SECTION_PROMPTS: Record<string, string> = {
  comps: `Analyze comp/discount data for a single restaurant venue on a single night. Look for:
- Servers with disproportionately high comp volume or dollar amount
- Repeated comp reasons that suggest systemic issues (e.g. multiple BOH mistakes = kitchen problem)
- High-value comps on low-check tables (potential misuse)
- Same guest/table getting comped multiple times
- Comp reasons that don't match comped items (e.g. "BOH Mistake" on a drink)
- Unusual comp patterns compared to what's normal (comp % above 3-4% is elevated)`,

  servers: `Analyze server performance data for a single restaurant venue on a single night. Look for:
- Servers with unusually low tip % (below 15% = potential service issue)
- Servers with very high or very low avg ticket vs peers (coaching opportunity)
- Servers with high covers but low sales (not upselling)
- Servers with comps that seem unusual for their check volume
- Top performers worth recognizing`,

  labor: `Analyze labor data for a single restaurant venue on a single night. Look for:
- Labor % above 30% (elevated) or above 35% (critical)
- FOH/BOH cost imbalance relative to sales mix
- Low SPLH (sales per labor hour below $50 is concerning)
- Overstaffing indicators (high employee count relative to covers)
- Understaffing indicators (very high covers per employee)`,

  items: `Analyze menu item sales data for a single restaurant venue on a single night. Look for:
- Items with unusually high comp rates
- Top sellers by revenue (acknowledge strength)
- Items with very low qty but high price (potential spoilage risk if perishable)
- Category concentration (too dependent on one item)
- Beverage vs food balance opportunities`,

  categories: `Analyze sales category mix data for a single restaurant venue on a single night. Look for:
- Beverage mix below 40% (missed upsell opportunity for nightlife venues)
- Any category with outsized comp amount relative to sales
- Category gaps that suggest menu or service opportunities
- Revenue concentration in too few categories`,
};

export async function generateDrillInsights(
  input: DrillInsightInput
): Promise<DrillInsight[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const sectionPrompt = SECTION_PROMPTS[input.section];
  if (!sectionPrompt) return [];

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are an operations analyst for a high-end restaurant group. You're reviewing ${input.section} data for ${input.venueName} on ${input.date}.

${sectionPrompt}

Data:
${JSON.stringify(input.data, null, 2)}

Return a JSON array of actionable insights. Only include genuine patterns worth flagging — do NOT manufacture insights if the data looks normal. If everything looks clean, return an empty array [].

Each insight must have:
- "pattern": short label (2-4 words)
- "detail": 1-2 sentences with specific numbers from the data
- "action": one concrete next step (who should do what)
- "severity": "high" (needs immediate attention), "medium" (worth reviewing), or "low" (FYI/positive)

Rules:
- Maximum 3 insights (only the most important)
- Be specific — reference actual server names, dollar amounts, percentages from the data
- Actions should be practical: "pull server aside", "review with chef", "audit checks", etc.
- Do NOT flag things that are normal for upscale dining (high check averages, premium items)
- Do NOT use emojis
- Return ONLY the JSON array, no markdown fences`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = message.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') return [];

    let raw = textContent.text.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const insights: DrillInsight[] = JSON.parse(raw);
    // Validate shape
    return insights.filter(
      (i) => i.pattern && i.detail && i.action && ['high', 'medium', 'low'].includes(i.severity)
    ).slice(0, 3);
  } catch (err: any) {
    console.error('[drill-insights] AI analysis failed:', err.message);
    return [];
  }
}
