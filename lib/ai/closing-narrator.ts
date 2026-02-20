/**
 * Unified Closing Narrative Generator
 * Generates one cohesive closing summary for the nightly attestation,
 * incorporating both raw operational data AND the manager's inputs
 * (tags, notes, resolutions, incidents, coaching actions).
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClosingNarrativeInput {
  date: string;
  venueName: string;

  // Revenue data
  net_sales: number;
  total_covers: number;
  avg_check: number;
  food_sales: number;
  beverage_sales: number;
  beverage_pct: number;
  forecast_net_sales: number | null;
  vs_forecast_pct: number | null;
  vs_sdlw_pct: number | null;
  vs_sdly_pct: number | null;

  // Labor data
  labor_cost: number;
  labor_pct: number;
  splh: number;
  ot_hours: number;
  total_labor_hours: number;
  employee_count: number;

  // Comp data
  total_comps: number;
  comp_pct: number;
  comp_exception_count: number;

  // Health
  health_score: number | null;

  // Manager inputs — revenue (6 structured prompts)
  revenue_driver: string | null;
  revenue_mgmt_impact: string | null;
  revenue_lost_opportunity: string | null;
  revenue_demand_signal: string | null;
  revenue_quality: string | null;
  revenue_action: string | null;
  // Legacy / AI-extracted
  revenue_tags: string[];
  revenue_notes: string | null;

  // Manager inputs — comps (3 structured prompts)
  comp_driver: string | null;
  comp_pattern: string | null;
  comp_compliance: string | null;
  comp_tags: string[];
  comp_notes: string | null;
  comp_acknowledged: boolean;

  // Manager inputs — labor (4 structured prompts)
  labor_foh_coverage: string | null;
  labor_boh_performance: string | null;
  labor_decision: string | null;
  labor_change: string | null;
  labor_tags: string[];
  labor_notes: string | null;
  labor_foh_notes: string | null;
  labor_boh_notes: string | null;
  labor_acknowledged: boolean;
  comp_resolutions: Array<{
    check_id?: string;
    comp_amount?: number;
    resolution_code: string;
    requires_follow_up: boolean;
  }>;

  // Manager inputs — incidents
  incident_tags: string[];
  incident_notes: string | null;
  incidents_acknowledged: boolean;
  incidents: Array<{
    incident_type: string;
    severity: string;
    description: string;
    resolved: boolean;
  }>;

  // Manager inputs — coaching (5 structured prompts: FOH + BOH + shared)
  coaching_foh_standout: string | null;
  coaching_foh_development: string | null;
  coaching_boh_standout: string | null;
  coaching_boh_development: string | null;
  coaching_team_focus: string | null;
  coaching_tags: string[];
  coaching_notes: string | null;
  coaching_acknowledged: boolean;
  coaching_actions: Array<{
    employee_name: string;
    coaching_type: string;
    reason: string;
  }>;

  // Auto-surfaced guest data
  top_spenders: Array<{
    server: string;
    covers: number;
    payment: number;
    table_name: string;
    cardholder_name: string | null;
    items: string[];
  }>;
  known_vips: Array<{
    name: string;
    is_vip: boolean;
    party_size: number;
    total_payment: number;
  }>;

  // Manager inputs — guest (3 structured prompts)
  guest_vip_notable: string | null;
  guest_experience: string | null;
  guest_opportunity: string | null;
  guest_tags: string[];
  guest_notes: string | null;
  guest_acknowledged: boolean;

  // Manager inputs — entertainment
  entertainment_tags: string[];
  entertainment_notes: string | null;

  // Manager inputs — culinary
  culinary_tags: string[];
  culinary_notes: string | null;

  // Trigger flags (informational)
  trigger_reasons: string[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildClosingPrompt(input: ClosingNarrativeInput): string {
  const dayOfWeek = new Date(input.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  const fmtCurrency = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const fmtPct = (v: number | null) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';

  const sections: string[] = [];

  // Raw data section
  sections.push(`## Operational Data — ${dayOfWeek}, ${input.date}
- Net Sales: ${fmtCurrency(input.net_sales)} | Covers: ${input.total_covers} | Avg Check: ${fmtCurrency(input.avg_check)}
- Food: ${fmtCurrency(input.food_sales)} | Beverage: ${fmtCurrency(input.beverage_sales)} (${input.beverage_pct.toFixed(0)}% mix)
${input.forecast_net_sales ? `- vs Forecast: ${fmtPct(input.vs_forecast_pct)} (target ${fmtCurrency(input.forecast_net_sales)})` : '- Forecast: N/A'}
${input.vs_sdlw_pct != null ? `- vs SDLW: ${fmtPct(input.vs_sdlw_pct)}` : ''}
- Labor: ${fmtCurrency(input.labor_cost)} (${input.labor_pct.toFixed(1)}%) | ${input.total_labor_hours.toFixed(0)}h | SPLH: ${fmtCurrency(input.splh)} | OT: ${input.ot_hours.toFixed(1)}h
- Comps: ${fmtCurrency(input.total_comps)} (${input.comp_pct.toFixed(1)}%) | ${input.comp_exception_count} exception(s)
${input.health_score != null ? `- Health Score: ${Math.round(input.health_score)}` : ''}`);

  // Top spenders section
  if (input.top_spenders && input.top_spenders.length > 0) {
    const spenderLines = input.top_spenders.map((s, i) =>
      `- #${i + 1}: ${fmtCurrency(s.payment)} (${s.covers} covers, table ${s.table_name || 'N/A'}, server: ${s.server})${s.items.length > 0 ? ` — ${s.items.slice(0, 3).join(', ')}` : ''}`
    );
    sections.push(`## Top Spenders\n${spenderLines.join('\n')}`);
  }

  // Known VIPs section
  if (input.known_vips && input.known_vips.length > 0) {
    const vipLines = input.known_vips.map(v =>
      `- ${v.name}${v.is_vip ? ' (VIP)' : ''} — party of ${v.party_size}${v.total_payment > 0 ? `, ${fmtCurrency(v.total_payment)} spent` : ''}`
    );
    sections.push(`## Known Guests\n${vipLines.join('\n')}`);
  }

  // Manager assessment section — structured prompts for revenue, notes for other modules
  const managerLines: string[] = [];

  // Revenue — 6 structured prompts
  if (input.revenue_driver) {
    managerLines.push(`Revenue driver: "${input.revenue_driver}"`);
  }
  if (input.revenue_mgmt_impact) {
    managerLines.push(`Management impact: "${input.revenue_mgmt_impact}"`);
  }
  if (input.revenue_lost_opportunity) {
    managerLines.push(`Lost opportunity: "${input.revenue_lost_opportunity}"`);
  }
  if (input.revenue_demand_signal) {
    managerLines.push(`Demand signal: "${input.revenue_demand_signal}"`);
  }
  if (input.revenue_quality) {
    managerLines.push(`Revenue quality: "${input.revenue_quality}"`);
  }
  if (input.revenue_action) {
    managerLines.push(`Next shift action: "${input.revenue_action}"`);
  }
  // Legacy fallback
  if (input.revenue_notes && !input.revenue_driver) {
    managerLines.push(`Revenue notes: "${input.revenue_notes}"`);
  }
  if (input.revenue_tags.length > 0) {
    managerLines.push(`Revenue tags: ${input.revenue_tags.join(', ')}`);
  }

  // Comps (3 structured prompts)
  if (input.comp_driver) {
    managerLines.push(`Comp driver: "${input.comp_driver}"`);
  }
  if (input.comp_pattern) {
    managerLines.push(`Comp patterns: "${input.comp_pattern}"`);
  }
  if (input.comp_compliance) {
    managerLines.push(`Comp compliance: "${input.comp_compliance}"`);
  }
  // Legacy fallback
  if (input.comp_notes && !input.comp_driver) {
    managerLines.push(`Comps: "${input.comp_notes}"`);
  }
  if (!input.comp_driver && !input.comp_notes && input.comp_acknowledged) {
    managerLines.push('Comps: Nothing to report — standard activity');
  }
  if (input.comp_tags.length > 0) {
    managerLines.push(`Comp tags: ${input.comp_tags.join(', ')}`);
  }

  // Labor (4 structured prompts)
  if (input.labor_foh_coverage) {
    managerLines.push(`Labor FOH coverage: "${input.labor_foh_coverage}"`);
  }
  if (input.labor_boh_performance) {
    managerLines.push(`Labor BOH performance: "${input.labor_boh_performance}"`);
  }
  if (input.labor_decision) {
    managerLines.push(`Staffing decisions: "${input.labor_decision}"`);
  }
  if (input.labor_change) {
    managerLines.push(`Labor plan change: "${input.labor_change}"`);
  }
  // Legacy fallback
  if (input.labor_foh_notes && !input.labor_foh_coverage) {
    managerLines.push(`Labor FOH: "${input.labor_foh_notes}"`);
  }
  if (input.labor_boh_notes && !input.labor_boh_performance) {
    managerLines.push(`Labor BOH: "${input.labor_boh_notes}"`);
  }
  if (input.labor_notes && !input.labor_foh_coverage) {
    managerLines.push(`Labor notes: "${input.labor_notes}"`);
  }
  if (!input.labor_foh_coverage && !input.labor_foh_notes && input.labor_acknowledged) {
    managerLines.push('Labor: Nothing to report — standard staffing');
  }
  if (input.labor_tags.length > 0) {
    managerLines.push(`Labor tags: ${input.labor_tags.join(', ')}`);
  }
  if (input.comp_resolutions.length > 0) {
    const followUps = input.comp_resolutions.filter(r => r.requires_follow_up).length;
    managerLines.push(`Comp resolutions: ${input.comp_resolutions.length} resolved${followUps > 0 ? ` (${followUps} require follow-up)` : ''}`);
  }

  // Incidents
  if (input.incident_notes) {
    managerLines.push(`Incidents: "${input.incident_notes}"`);
  } else if (input.incidents_acknowledged) {
    managerLines.push('Incidents: Nothing to report — clean night');
  }
  if (input.incident_tags.length > 0) {
    managerLines.push(`Incident tags: ${input.incident_tags.join(', ')}`);
  }
  if (input.incidents.length > 0) {
    const unresolved = input.incidents.filter(i => !i.resolved).length;
    managerLines.push(`Incidents logged: ${input.incidents.length} (${unresolved} unresolved)`);
  }

  // Coaching (5 structured prompts: FOH + BOH + shared)
  if (input.coaching_foh_standout) {
    managerLines.push(`FOH standout: "${input.coaching_foh_standout}"`);
  }
  if (input.coaching_foh_development) {
    managerLines.push(`FOH development: "${input.coaching_foh_development}"`);
  }
  if (input.coaching_boh_standout) {
    managerLines.push(`BOH standout: "${input.coaching_boh_standout}"`);
  }
  if (input.coaching_boh_development) {
    managerLines.push(`BOH development: "${input.coaching_boh_development}"`);
  }
  if (input.coaching_team_focus) {
    managerLines.push(`Team focus: "${input.coaching_team_focus}"`);
  }
  // Legacy fallback
  if (input.coaching_notes && !input.coaching_foh_standout) {
    managerLines.push(`Coaching: "${input.coaching_notes}"`);
  }
  if (!input.coaching_foh_standout && !input.coaching_notes && input.coaching_acknowledged) {
    managerLines.push('Coaching: Nothing to report — all performing well');
  }
  if (input.coaching_tags.length > 0) {
    managerLines.push(`Coaching tags: ${input.coaching_tags.join(', ')}`);
  }
  if (input.coaching_actions.length > 0) {
    managerLines.push(`Coaching actions: ${input.coaching_actions.map(c => `${c.employee_name} (${c.coaching_type})`).join(', ')}`);
  }

  // Guest (3 structured prompts)
  if (input.guest_vip_notable) {
    managerLines.push(`Notable guests: "${input.guest_vip_notable}"`);
  }
  if (input.guest_experience) {
    managerLines.push(`Guest experience: "${input.guest_experience}"`);
  }
  if (input.guest_opportunity) {
    managerLines.push(`Guest opportunity: "${input.guest_opportunity}"`);
  }
  // Legacy fallback
  if (input.guest_notes && !input.guest_vip_notable) {
    managerLines.push(`Guest: "${input.guest_notes}"`);
  }
  if (!input.guest_vip_notable && !input.guest_notes && input.guest_acknowledged) {
    managerLines.push('Guests: Nothing notable to report');
  }
  if (input.guest_tags.length > 0) {
    managerLines.push(`Guest tags: ${input.guest_tags.join(', ')}`);
  }

  // Entertainment
  if (input.entertainment_notes) {
    managerLines.push(`Entertainment: "${input.entertainment_notes}"`);
  }
  if (input.entertainment_tags.length > 0) {
    managerLines.push(`Entertainment tags: ${input.entertainment_tags.join(', ')}`);
  }

  // Culinary
  if (input.culinary_notes) {
    managerLines.push(`Culinary: "${input.culinary_notes}"`);
  }
  if (input.culinary_tags.length > 0) {
    managerLines.push(`Culinary tags: ${input.culinary_tags.join(', ')}`);
  }

  if (managerLines.length > 0) {
    sections.push(`## Manager's Assessment\n${managerLines.map(l => `- ${l}`).join('\n')}`);
  }

  // Flagged items
  if (input.trigger_reasons.length > 0) {
    sections.push(`## Flagged Items\n${input.trigger_reasons.map(r => `- ${r}`).join('\n')}`);
  }

  return `You are an operations analyst for ${input.venueName}, a high-end dining/nightlife venue.

Write a unified closing summary for the manager's nightly attestation.

${sections.join('\n\n')}

## Instructions
Write a 4-8 sentence closing narrative that:
1. Opens with the night's headline — top-line sales performance vs expectations
2. Highlights what drove the night (using the manager's own driver tags and notes)
3. References notable guests, top spenders, or VIPs when present (use specific spend amounts, not names — protect guest privacy)
4. Calls out any flagged items, unresolved incidents, or follow-up actions
5. Notes labor efficiency and comp activity in context
6. Closes with any open items for the next shift

Tone: Executive briefing — direct, factual, specific numbers. No bullet points, no headers, no markdown formatting. Write in third person ("The venue..." not "You..."). Do NOT wrap in quotes. Return the narrative text only.`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function generateClosingNarrative(
  input: ClosingNarrativeInput,
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    temperature: 0.3,
    messages: [{ role: 'user', content: buildClosingPrompt(input) }],
  });

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI');
  }

  return textBlock.text.trim();
}
