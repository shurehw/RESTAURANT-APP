/**
 * AI Attestation Narrative Generator
 * Generates concise narratives for all 5 attestation modules.
 * Single Claude call produces all narratives — context is interrelated.
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttestationNarrativeInput {
  date: string;
  venueName: string;
  // Revenue
  net_sales: number;
  total_covers: number;
  avg_check: number;
  food_sales: number;
  beverage_sales: number;
  beverage_pct: number;
  forecast_net_sales: number | null;
  forecast_covers: number | null;
  vs_forecast_pct: number | null;
  vs_sdlw_pct: number | null;
  vs_sdly_pct: number | null;
  // Labor
  labor_cost: number;
  labor_pct: number;
  splh: number;
  ot_hours: number;
  total_labor_hours: number;
  employee_count: number;
  covers_per_labor_hour: number | null;
  foh_hours: number | null;
  foh_cost: number | null;
  boh_hours: number | null;
  boh_cost: number | null;
  // Comps
  total_comps: number;
  comp_pct: number;
  comp_exception_count: number;
  comp_critical_count: number;
  comp_overall_assessment: string | null;
  // Context
  health_score: number | null;
  incident_triggers: string[];
  // Entertainment
  has_entertainment?: boolean;
  entertainment_cost?: number | null;
  entertainment_pct?: number | null;
  // Culinary
  has_culinary?: boolean;
  eightysixed_count?: number;
  culinary_rating?: number | null;
}

export interface AttestationNarrativeOutput {
  revenue_narrative: string;
  labor_narrative: string;
  comp_narrative: string;
  incident_narrative: string;
  coaching_narrative: string;
  entertainment_narrative?: string;
  culinary_narrative?: string;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(input: AttestationNarrativeInput): string {
  const dayOfWeek = new Date(input.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

  const fmtCurrency = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const fmtPct = (v: number | null) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';

  const narrativeCount = 5 + (input.has_entertainment ? 1 : 0) + (input.has_culinary ? 1 : 0);

  return `You are an operations analyst for ${input.venueName}, a high-end dining/nightlife venue.

Generate ${narrativeCount} concise narrative briefs for the closing manager's nightly attestation on ${dayOfWeek}, ${input.date}.

## Revenue Data
- Net Sales: ${fmtCurrency(input.net_sales)}
- Covers: ${input.total_covers}
- Avg Check: ${fmtCurrency(input.avg_check)}
- Food Sales: ${fmtCurrency(input.food_sales)} | Beverage Sales: ${fmtCurrency(input.beverage_sales)}
- Beverage Mix: ${input.beverage_pct.toFixed(0)}%
${input.forecast_net_sales ? `- Forecast: ${fmtCurrency(input.forecast_net_sales)} (${fmtPct(input.vs_forecast_pct)} actual vs forecast)` : '- Forecast: Not available'}
${input.vs_sdlw_pct != null ? `- vs SDLW: ${fmtPct(input.vs_sdlw_pct)}` : ''}
${input.vs_sdly_pct != null ? `- vs SDLY: ${fmtPct(input.vs_sdly_pct)}` : ''}

## Labor Data
- Labor Cost: ${fmtCurrency(input.labor_cost)} (${input.labor_pct.toFixed(1)}% of net sales)
- Total Hours: ${input.total_labor_hours.toFixed(1)}h across ${input.employee_count} employees
- SPLH: ${fmtCurrency(input.splh)}
- OT Hours: ${input.ot_hours.toFixed(1)}h
${input.covers_per_labor_hour != null ? `- Covers per Labor Hour: ${input.covers_per_labor_hour.toFixed(1)}` : ''}
${input.foh_hours != null ? `- FOH: ${input.foh_hours.toFixed(1)}h / ${fmtCurrency(input.foh_cost || 0)}` : ''}
${input.boh_hours != null ? `- BOH: ${input.boh_hours.toFixed(1)}h / ${fmtCurrency(input.boh_cost || 0)}` : ''}

## Comp Data
- Total Comps: ${fmtCurrency(input.total_comps)}
- Comp %: ${input.comp_pct.toFixed(1)}% of net sales
- Exceptions Flagged: ${input.comp_exception_count} (${input.comp_critical_count} critical)
${input.comp_overall_assessment ? `- AI Review: ${input.comp_overall_assessment}` : ''}

## Context
${input.health_score != null ? `- Venue Health Score: ${Math.round(input.health_score)}` : '- Venue Health Score: N/A'}
${input.incident_triggers.length > 0 ? `- Incident Triggers: ${input.incident_triggers.join(', ')}` : '- No incident triggers flagged'}
${input.has_entertainment ? `
## Entertainment Data
- Entertainment Cost: ${input.entertainment_cost != null ? fmtCurrency(input.entertainment_cost) : 'Not available'}
- Entertainment % of Sales: ${input.entertainment_pct != null ? `${input.entertainment_pct.toFixed(1)}%` : 'N/A'}` : ''}
${input.has_culinary ? `
## Culinary Data
- 86'd Items: ${input.eightysixed_count ?? 0} items ran out tonight
- Chef Rating: ${input.culinary_rating != null ? `${input.culinary_rating}/5` : 'Not yet rated'}` : ''}

## Instructions
Produce a JSON object with ${narrativeCount} fields:
- "revenue_narrative": 2-4 sentences analyzing revenue performance. Compare vs forecast, SDLW, SDLY. Note food/bev split and avg check. Do NOT mention comps here.
- "labor_narrative": 2-4 sentences analyzing labor efficiency. Comment on labor % (target: 25-30%), SPLH, OT, and FOH/BOH balance if data available.
- "comp_narrative": 2-3 sentences analyzing comp activity. Note comp % (target: under 2%), any patterns in exceptions, and whether the volume seems normal for the night's revenue.
- "incident_narrative": 2-3 sentences on operational risk. Reference the health score, any flagged triggers, and what the manager should focus on when logging incidents.
- "coaching_narrative": 2-3 sentences suggesting coaching focus areas based on the night's data. Identify patterns that warrant recognition, correction, or follow-up.${input.has_entertainment ? `
- "entertainment_narrative": 2-3 sentences on entertainment cost efficiency and its relationship to the night's revenue. Note whether entertainment spend was proportional to sales performance.` : ''}${input.has_culinary ? `
- "culinary_narrative": 2-3 sentences on kitchen performance. Note 86'd items impact on revenue, chef's self-assessment, and any BOH operational concerns the manager should be aware of.` : ''}

Tone: Direct, factual, concise — no filler. Use specific numbers. Highlight anything unusual. Do not use bullet points.

Respond ONLY with valid JSON, no markdown fences.`;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function generateAttestationNarratives(
  input: AttestationNarrativeInput
): Promise<AttestationNarrativeOutput> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1200 + (input.has_entertainment ? 300 : 0) + (input.has_culinary ? 300 : 0),
    temperature: 0.3,
    messages: [{ role: 'user', content: buildPrompt(input) }],
  });

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI');
  }

  let raw = textBlock.text.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  const parsed = JSON.parse(raw) as AttestationNarrativeOutput;

  if (!parsed.revenue_narrative || !parsed.labor_narrative) {
    throw new Error('AI response missing required narrative fields');
  }

  // Provide fallbacks for new fields so older cached responses still work
  parsed.comp_narrative = parsed.comp_narrative || '';
  parsed.incident_narrative = parsed.incident_narrative || '';
  parsed.coaching_narrative = parsed.coaching_narrative || '';
  parsed.entertainment_narrative = parsed.entertainment_narrative || '';
  parsed.culinary_narrative = parsed.culinary_narrative || '';

  return parsed;
}
