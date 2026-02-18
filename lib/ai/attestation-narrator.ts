/**
 * AI Attestation Narrative Generator
 * Generates concise revenue + labor narratives for the nightly attestation stepper.
 * Single Claude call produces both narratives — context is interrelated.
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
  total_comps: number;
  avg_check: number;
  food_sales: number;
  beverage_sales: number;
  beverage_pct: number;
  comp_pct: number;
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
  // Context
  comp_exception_count: number;
  comp_pct_status: string;
  health_score: number | null;
}

export interface AttestationNarrativeOutput {
  revenue_narrative: string;
  labor_narrative: string;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(input: AttestationNarrativeInput): string {
  const dayOfWeek = new Date(input.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

  const fmtCurrency = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const fmtPct = (v: number | null) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';

  return `You are an operations analyst for ${input.venueName}, a high-end dining/nightlife venue.

Generate two concise narrative briefs for the closing manager's nightly attestation on ${dayOfWeek}, ${input.date}.

## Revenue Data
- Net Sales: ${fmtCurrency(input.net_sales)}
- Covers: ${input.total_covers}
- Avg Check: ${fmtCurrency(input.avg_check)}
- Food Sales: ${fmtCurrency(input.food_sales)} | Beverage Sales: ${fmtCurrency(input.beverage_sales)}
- Beverage Mix: ${input.beverage_pct.toFixed(0)}%
- Total Comps: ${fmtCurrency(input.total_comps)} (${input.comp_pct.toFixed(1)}% of net) — Status: ${input.comp_pct_status}
- Comp Exceptions Flagged: ${input.comp_exception_count}
${input.forecast_net_sales ? `- Forecast: ${fmtCurrency(input.forecast_net_sales)} (${fmtPct(input.vs_forecast_pct)} actual vs forecast)` : '- Forecast: Not available'}
${input.vs_sdlw_pct != null ? `- vs SDLW: ${fmtPct(input.vs_sdlw_pct)}` : ''}
${input.vs_sdly_pct != null ? `- vs SDLY: ${fmtPct(input.vs_sdly_pct)}` : ''}
${input.health_score != null ? `- Venue Health Score: ${Math.round(input.health_score)}` : ''}

## Labor Data
- Labor Cost: ${fmtCurrency(input.labor_cost)} (${input.labor_pct.toFixed(1)}% of net sales)
- Total Hours: ${input.total_labor_hours.toFixed(1)}h across ${input.employee_count} employees
- SPLH: ${fmtCurrency(input.splh)}
- OT Hours: ${input.ot_hours.toFixed(1)}h
${input.covers_per_labor_hour != null ? `- Covers per Labor Hour: ${input.covers_per_labor_hour.toFixed(1)}` : ''}
${input.foh_hours != null ? `- FOH: ${input.foh_hours.toFixed(1)}h / ${fmtCurrency(input.foh_cost || 0)}` : ''}
${input.boh_hours != null ? `- BOH: ${input.boh_hours.toFixed(1)}h / ${fmtCurrency(input.boh_cost || 0)}` : ''}

## Instructions
Produce a JSON object with two fields:
- "revenue_narrative": 2-4 sentences analyzing revenue performance. Compare vs forecast, SDLW, SDLY. Note bev mix and avg check. Mention comp rate only if noteworthy (>2% or flagged).
- "labor_narrative": 2-4 sentences analyzing labor efficiency. Comment on labor % (target: 25-30%), SPLH, OT, and FOH/BOH balance if data available.

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
    max_tokens: 600,
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

  return parsed;
}
