/**
 * Weekly Executive Summary AI Narrator
 *
 * Generates a structured JSON narrative from 7 days of venue data.
 * Follows the closing-narrator.ts pattern: deterministic data +
 * AI narrative synthesis.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { WeeklyAgendaPayload } from '@/lib/database/weekly-agenda';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface WeeklyNarrativeOutput {
  executive_summary: string;
  revenue_analysis: string;
  guest_experience: string;
  labor_analysis: string;
  enforcement_analysis: string;
  key_risks: string[];
  recommendations: string[];
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

const fmtC = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtPct = (v: number | null) =>
  v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';

// ══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ══════════════════════════════════════════════════════════════════════════

function buildWeeklyPrompt(payload: WeeklyAgendaPayload): string {
  const { days, totals, enforcement, labor_insights, reviews } = payload;

  // Daily revenue table
  const dayHeaders = days.map(d => `${d.day_of_week.slice(0, 3)} ${d.business_date.slice(5)}`);
  const revenueTable = [
    `Day          | ${dayHeaders.join(' | ')}`,
    `Net Sales    | ${days.map(d => fmtC(d.net_sales)).join(' | ')}`,
    `Covers       | ${days.map(d => String(d.covers_count)).join(' | ')}`,
    `Avg Check    | ${days.map(d => fmtC(d.avg_check)).join(' | ')}`,
    `Bev %        | ${days.map(d => d.beverage_pct.toFixed(0) + '%').join(' | ')}`,
    `vs Forecast  | ${days.map(d => fmtPct(d.vs_forecast_pct)).join(' | ')}`,
    `vs SDLW      | ${days.map(d => fmtPct(d.vs_sdlw_pct)).join(' | ')}`,
    `Comps        | ${days.map(d => fmtC(d.comps_total)).join(' | ')}`,
  ].join('\n');

  // Daily labor table
  const laborTable = [
    `Day          | ${dayHeaders.join(' | ')}`,
    `Labor Cost   | ${days.map(d => fmtC(d.labor_cost)).join(' | ')}`,
    `Labor %      | ${days.map(d => d.labor_pct.toFixed(1) + '%').join(' | ')}`,
    `Hours        | ${days.map(d => d.labor_hours.toFixed(0)).join(' | ')}`,
    `OT Hours     | ${days.map(d => d.ot_hours.toFixed(1)).join(' | ')}`,
    `SPLH         | ${days.map(d => fmtC(d.splh)).join(' | ')}`,
  ].join('\n');

  // Enforcement scorecard
  const enfLines = [
    `Comp Exceptions: ${enforcement.total_comp_exceptions}`,
    `Labor Exceptions: ${enforcement.total_labor_exceptions}`,
    `Revenue Variances: ${enforcement.total_revenue_variances}`,
    `Carry-Forward Items: ${enforcement.carry_forward_count}`,
    `Critical Open: ${enforcement.critical_open_count}`,
    `Escalated: ${enforcement.escalated_count}`,
    `Attestation Compliance: ${enforcement.attestation_submitted}/${enforcement.attestation_expected} (${enforcement.attestation_compliance_pct.toFixed(0)}%)`,
  ];

  if (enforcement.comp_resolutions.length > 0) {
    enfLines.push('');
    enfLines.push('Comp Resolutions:');
    for (const cr of enforcement.comp_resolutions) {
      enfLines.push(`  ${cr.resolution_code}: ${cr.count} comps, ${fmtC(cr.total_amount)}${cr.policy_violation_count > 0 ? ` (${cr.policy_violation_count} policy violations)` : ''}`);
    }
  }

  // Labor insights from attestations
  const insightLines: string[] = [];
  if (labor_insights.revenue_variance_reasons.length > 0) {
    insightLines.push('Revenue variance reasons reported by managers:');
    for (const r of labor_insights.revenue_variance_reasons) {
      insightLines.push(`  ${r.reason}: ${r.count}x`);
    }
  }
  if (labor_insights.labor_variance_reasons.length > 0) {
    insightLines.push('Labor variance reasons reported by managers:');
    for (const r of labor_insights.labor_variance_reasons) {
      insightLines.push(`  ${r.reason}: ${r.count}x`);
    }
  }
  if (labor_insights.labor_tags.length > 0) {
    insightLines.push('Labor tags from attestations:');
    for (const t of labor_insights.labor_tags) {
      insightLines.push(`  ${t.tag}: ${t.count}x`);
    }
  }

  // Review data section
  const reviewLines: string[] = [];
  if (reviews.total_reviews > 0) {
    reviewLines.push(`Total Reviews: ${reviews.total_reviews}`);
    reviewLines.push(`Avg Rating: ${reviews.avg_rating?.toFixed(2) ?? 'N/A'}`);
    reviewLines.push(`Negative Reviews (≤2 stars): ${reviews.negative_reviews}`);
    reviewLines.push(`Unresponded: ${reviews.unresponded_count}`);
    const srcParts = Object.entries(reviews.source_breakdown)
      .map(([src, cnt]) => `${src}: ${cnt}`)
      .join(', ');
    if (srcParts) reviewLines.push(`By Source: ${srcParts}`);
    if (reviews.top_tags.length > 0) {
      reviewLines.push(`Top Tags: ${reviews.top_tags.map(t => `${t.tag} (${t.count})`).join(', ')}`);
    }
    if (reviews.negative_review_texts.length > 0) {
      reviewLines.push('');
      reviewLines.push('Negative Review Texts:');
      for (const r of reviews.negative_review_texts) {
        reviewLines.push(`  [${r.source} ${r.rating}★] ${r.content.slice(0, 300)}${r.content.length > 300 ? '...' : ''}`);
      }
    }
  }

  // GM context section (only included when notes are present)
  const gmLines: string[] = [];
  const gm = payload.gm_notes;
  if (gm) {
    if (gm.headline) gmLines.push(`Headline: ${gm.headline}`);
    if (gm.revenue_context) gmLines.push(`Revenue Context: ${gm.revenue_context}`);
    // Guest Experience
    if (gm.opentable_rating != null) gmLines.push(`OpenTable Rating: ${gm.opentable_rating}`);
    if (gm.google_rating != null) gmLines.push(`Google Rating: ${gm.google_rating}`);
    if (gm.guest_compliments) gmLines.push(`Top Compliments: ${gm.guest_compliments}`);
    if (gm.guest_complaints) gmLines.push(`Top Complaints: ${gm.guest_complaints}`);
    if (gm.guest_action_items) gmLines.push(`Guest Action Items: ${gm.guest_action_items}`);
    // Team
    if (gm.staffing_notes) gmLines.push(`Staffing Notes: ${gm.staffing_notes}`);
    if (gm.team_shoutout) gmLines.push(`Team Shoutout: ${gm.team_shoutout}`);
    // Enforcement
    if (gm.comp_context) gmLines.push(`Comp/Exception Context: ${gm.comp_context}`);
    // Operations
    if (gm.operations_notes) gmLines.push(`Operations & Maintenance: ${gm.operations_notes}`);
    // Forward-looking
    if (gm.next_week_outlook) gmLines.push(`Next Week Focus: ${gm.next_week_outlook}`);
    if (gm.upcoming_events) gmLines.push(`Upcoming Events: ${gm.upcoming_events}`);
  }

  return `You are the operations analyst for ${payload.venue_name}. Generate a weekly executive briefing for the week of ${payload.week_start} through ${payload.week_end}.

## Revenue Data (7-day breakdown)
${revenueTable}

## Weekly Totals
Net Sales: ${fmtC(totals.net_sales)}  |  Covers: ${totals.covers_count}  |  Checks: ${totals.checks_count}  |  Avg Check: ${fmtC(totals.avg_check)}
Food: ${fmtC(totals.food_sales)}  |  Beverage: ${fmtC(totals.beverage_sales)} (${totals.beverage_pct.toFixed(0)}%)
Comps: ${fmtC(totals.comps_total)} (${totals.comp_pct.toFixed(1)}%)  |  Voids: ${fmtC(totals.voids_total)}
vs Forecast: ${fmtPct(totals.vs_forecast_pct)}  |  vs SDLW: ${fmtPct(totals.vs_sdlw_pct)}

## Labor Overview
${laborTable}

Weekly Totals: ${fmtC(totals.total_labor_cost)} (${totals.labor_pct.toFixed(1)}%)  |  ${totals.total_labor_hours.toFixed(0)}h total  |  ${totals.total_ot_hours.toFixed(1)}h OT  |  SPLH: ${fmtC(totals.avg_splh)}

## Enforcement Scorecard
${enfLines.join('\n')}

${insightLines.length > 0 ? `## Manager-Reported Insights\n${insightLines.join('\n')}` : ''}

${reviewLines.length > 0 ? `## Guest Reviews (auto-pulled from TipSee)\n${reviewLines.join('\n')}` : ''}

${gmLines.length > 0 ? `## GM Context (provided by the General Manager)\n${gmLines.join('\n')}\n\nIMPORTANT: Weave the GM's context naturally into the relevant analysis sections. Do not create a separate "GM Notes" section — integrate their context into executive_summary, revenue_analysis, labor_analysis, guest_experience, and enforcement_analysis where applicable. Reference the GM's observations as context for the data patterns.` : ''}

## Instructions
Produce a JSON object with these 7 fields:
- "executive_summary": 3-5 sentences. High-level week performance, key story, bottom line.
- "revenue_analysis": 3-5 sentences. Trend across the week, best/worst days with specific amounts, variance commentary, beverage mix.
- "guest_experience": 2-4 sentences. Synthesize the review data into a guest sentiment overview. Identify recurring themes from negative reviews if present (e.g. "multiple complaints about wait times" or "food quality cited in 3 negative reviews"). Mention the avg rating, review volume, and any unresponded reviews. If no review data is available, state that.
- "labor_analysis": 2-3 sentences. Efficiency, staffing alignment to volume, OT commentary, SPLH trends.
- "enforcement_analysis": 2-3 sentences. Compliance status, exception patterns, open items requiring attention.
- "key_risks": Array of 3-5 strings. Specific risk items identified from the data.
- "recommendations": Array of 3-5 strings. Actionable items for the coming week.

Tone: Direct, factual, concise. A sharp operator reading this at 7am. Use specific dollar amounts and percentages from the data. Do not hedge or qualify — state what the data shows.

Respond ONLY with valid JSON. No markdown fences. No preamble.`;
}

// ══════════════════════════════════════════════════════════════════════════
// GENERATION
// ══════════════════════════════════════════════════════════════════════════

export async function generateWeeklyNarrative(
  payload: WeeklyAgendaPayload,
): Promise<WeeklyNarrativeOutput> {
  const prompt = buildWeeklyPrompt(payload);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = message.content.find(b => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in AI response');
  }

  let raw = textContent.text.trim();
  // Strip markdown fences if present
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(raw) as WeeklyNarrativeOutput;

  // Validate required fields
  if (!parsed.executive_summary || !parsed.revenue_analysis) {
    throw new Error('AI response missing required narrative fields');
  }

  return parsed;
}
