/**
 * Nightly Operating Report Generator
 * Two-part output:
 *   1. Financial Snapshot — code-generated, deterministic, no AI
 *   2. Manager's Narrative — AI-generated from structured prompts
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

  // Comp / voids / discounts
  total_comps: number;
  comp_pct: number;
  comp_exception_count: number;
  voids_total: number;
  discounts_total: number;

  // Checks
  checks_count: number;
  avg_party_size: number;

  // Health
  health_score: number | null;

  // Top menu items (from TipSee)
  top_items: Array<{
    name: string;
    revenue: number;
    quantity: number;
  }>;

  // Server performance (from TipSee)
  servers: Array<{
    name: string;
    net_sales: number;
    covers: number;
    checks: number;
    avg_check: number;
    tip_pct: number;
  }>;

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
// Helpers
// ---------------------------------------------------------------------------

const fmtCurrency = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtPct = (v: number | null) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';

// ---------------------------------------------------------------------------
// Part 1: Financial Snapshot (code-generated, deterministic)
// ---------------------------------------------------------------------------

export function buildFinancialSnapshot(input: ClosingNarrativeInput): string {
  const dayOfWeek = new Date(input.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

  const lines: string[] = [];

  // Header
  lines.push(`NIGHTLY OPERATING REPORT`);
  lines.push(`${input.venueName} — ${dayOfWeek}, ${input.date}`);
  lines.push('');

  // Revenue block
  lines.push(`Revenue: ${fmtCurrency(input.net_sales)}    Covers: ${input.total_covers}    Avg Check: ${fmtCurrency(input.avg_check)}`);
  if (input.checks_count > 0) {
    lines.push(`Checks: ${input.checks_count}    Avg Party: ${input.avg_party_size.toFixed(1)}`);
  }
  const foodPct = input.net_sales > 0 ? ((input.food_sales / input.net_sales) * 100).toFixed(0) : '0';
  const bevPct = input.beverage_pct.toFixed(0);
  lines.push(`Food: ${fmtCurrency(input.food_sales)} (${foodPct}%)    Beverage: ${fmtCurrency(input.beverage_sales)} (${bevPct}%)`);

  // Variance line
  const varParts: string[] = [];
  if (input.vs_forecast_pct != null) varParts.push(`vs Forecast: ${fmtPct(input.vs_forecast_pct)}`);
  if (input.vs_sdlw_pct != null) varParts.push(`vs SDLW: ${fmtPct(input.vs_sdlw_pct)}`);
  if (input.vs_sdly_pct != null) varParts.push(`vs SDLY: ${fmtPct(input.vs_sdly_pct)}`);
  if (varParts.length > 0) lines.push(varParts.join('    '));
  lines.push('');

  // Top checks
  if (input.top_spenders && input.top_spenders.length > 0) {
    lines.push('Top Checks:');
    input.top_spenders.slice(0, 3).forEach(s => {
      lines.push(`  ${s.table_name} — ${fmtCurrency(s.payment)} (${s.covers} covers)`);
    });
    const bigTables = input.top_spenders.filter(s => s.payment >= 1000).length;
    if (bigTables > 0) lines.push(`Tables > $1,000: ${bigTables}`);
    lines.push('');
  }

  // Top items
  if (input.top_items?.length > 0) {
    lines.push('Top Items:');
    input.top_items.slice(0, 3).forEach(item => {
      lines.push(`  ${item.name} — ${fmtCurrency(item.revenue)} (${item.quantity} sold)`);
    });
    lines.push('');
  }

  // Operations line
  const compsLine = [`Comps: ${fmtCurrency(input.total_comps)} (${input.comp_pct.toFixed(1)}%)`];
  if (input.voids_total > 0) compsLine.push(`Voids: ${fmtCurrency(input.voids_total)}`);
  if (input.discounts_total > 0) compsLine.push(`Discounts: ${fmtCurrency(input.discounts_total)}`);
  lines.push(`${compsLine.join('    ')}    Labor: ${fmtCurrency(input.labor_cost)} (${input.labor_pct.toFixed(1)}%)    OT: ${input.ot_hours.toFixed(1)}h`);
  lines.push(`SPLH: ${fmtCurrency(input.splh)}    Staff: ${input.employee_count}    Hours: ${input.total_labor_hours.toFixed(0)}`);
  if (input.health_score != null) {
    lines.push(`Health Score: ${Math.round(input.health_score)}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Part 2: AI Narrative Prompt
// ---------------------------------------------------------------------------

function buildNarrativePrompt(input: ClosingNarrativeInput): string {
  // Feed all manager inputs to the AI so it can synthesize
  const context: string[] = [];

  // Revenue context
  if (input.revenue_driver) context.push(`Revenue driver: "${input.revenue_driver}"`);
  if (input.revenue_mgmt_impact) context.push(`Management impact: "${input.revenue_mgmt_impact}"`);
  if (input.revenue_lost_opportunity) context.push(`Lost opportunity: "${input.revenue_lost_opportunity}"`);
  if (input.revenue_demand_signal) context.push(`Demand signal: "${input.revenue_demand_signal}"`);
  if (input.revenue_quality) context.push(`Revenue quality: "${input.revenue_quality}"`);
  if (input.revenue_action) context.push(`Next shift action: "${input.revenue_action}"`);
  if (input.revenue_notes && !input.revenue_driver) context.push(`Revenue notes: "${input.revenue_notes}"`);
  if (input.revenue_tags.length > 0) context.push(`Revenue tags: ${input.revenue_tags.join(', ')}`);

  // Comp context
  if (input.comp_driver) context.push(`Comp driver: "${input.comp_driver}"`);
  if (input.comp_pattern) context.push(`Comp patterns: "${input.comp_pattern}"`);
  if (input.comp_compliance) context.push(`Comp compliance: "${input.comp_compliance}"`);
  if (input.comp_notes && !input.comp_driver) context.push(`Comp notes: "${input.comp_notes}"`);
  if (!input.comp_driver && !input.comp_notes && input.comp_acknowledged) context.push('Comps: Nothing to report — standard activity');
  if (input.comp_tags.length > 0) context.push(`Comp tags: ${input.comp_tags.join(', ')}`);
  if (input.comp_resolutions.length > 0) {
    const followUps = input.comp_resolutions.filter(r => r.requires_follow_up).length;
    context.push(`Comp resolutions: ${input.comp_resolutions.length} resolved${followUps > 0 ? ` (${followUps} require follow-up)` : ''}`);
  }

  // Labor context
  if (input.labor_foh_coverage) context.push(`Labor FOH coverage: "${input.labor_foh_coverage}"`);
  if (input.labor_boh_performance) context.push(`Labor BOH performance: "${input.labor_boh_performance}"`);
  if (input.labor_decision) context.push(`Staffing decisions: "${input.labor_decision}"`);
  if (input.labor_change) context.push(`Labor plan change: "${input.labor_change}"`);
  if (input.labor_foh_notes && !input.labor_foh_coverage) context.push(`Labor FOH: "${input.labor_foh_notes}"`);
  if (input.labor_boh_notes && !input.labor_boh_performance) context.push(`Labor BOH: "${input.labor_boh_notes}"`);
  if (input.labor_notes && !input.labor_foh_coverage) context.push(`Labor notes: "${input.labor_notes}"`);
  if (!input.labor_foh_coverage && !input.labor_foh_notes && input.labor_acknowledged) context.push('Labor: Nothing to report — standard staffing');
  if (input.labor_tags.length > 0) context.push(`Labor tags: ${input.labor_tags.join(', ')}`);

  // Incidents
  if (input.incident_notes) context.push(`Incidents: "${input.incident_notes}"`);
  else if (input.incidents_acknowledged) context.push('Incidents: Nothing to report — clean night');
  if (input.incident_tags.length > 0) context.push(`Incident tags: ${input.incident_tags.join(', ')}`);
  if (input.incidents.length > 0) {
    const unresolved = input.incidents.filter(i => !i.resolved).length;
    context.push(`Incidents logged: ${input.incidents.length} (${unresolved} unresolved)`);
    input.incidents.forEach(i => context.push(`  - ${i.incident_type} (${i.severity}): ${i.description} [${i.resolved ? 'resolved' : 'OPEN'}]`));
  }

  // Coaching
  if (input.coaching_foh_standout) context.push(`FOH standout: "${input.coaching_foh_standout}"`);
  if (input.coaching_foh_development) context.push(`FOH development: "${input.coaching_foh_development}"`);
  if (input.coaching_boh_standout) context.push(`BOH standout: "${input.coaching_boh_standout}"`);
  if (input.coaching_boh_development) context.push(`BOH development: "${input.coaching_boh_development}"`);
  if (input.coaching_team_focus) context.push(`Team focus: "${input.coaching_team_focus}"`);
  if (input.coaching_notes && !input.coaching_foh_standout) context.push(`Coaching: "${input.coaching_notes}"`);
  if (!input.coaching_foh_standout && !input.coaching_notes && input.coaching_acknowledged) context.push('Coaching: Nothing to report — all performing well');
  if (input.coaching_actions.length > 0) {
    context.push(`Coaching actions: ${input.coaching_actions.map(c => `${c.employee_name} (${c.coaching_type}: ${c.reason})`).join('; ')}`);
  }

  // Guest
  if (input.guest_vip_notable) context.push(`Notable guests: "${input.guest_vip_notable}"`);
  if (input.guest_experience) context.push(`Guest experience: "${input.guest_experience}"`);
  if (input.guest_opportunity) context.push(`Guest opportunity: "${input.guest_opportunity}"`);
  if (input.guest_notes && !input.guest_vip_notable) context.push(`Guest notes: "${input.guest_notes}"`);
  if (!input.guest_vip_notable && !input.guest_notes && input.guest_acknowledged) context.push('Guests: Nothing notable to report');
  if (input.guest_tags.length > 0) context.push(`Guest tags: ${input.guest_tags.join(', ')}`);

  // Entertainment
  if (input.entertainment_notes) context.push(`Entertainment: "${input.entertainment_notes}"`);
  if (input.entertainment_tags.length > 0) context.push(`Entertainment tags: ${input.entertainment_tags.join(', ')}`);

  // Culinary
  if (input.culinary_notes) context.push(`Culinary: "${input.culinary_notes}"`);
  if (input.culinary_tags.length > 0) context.push(`Culinary tags: ${input.culinary_tags.join(', ')}`);

  // Top spenders (for AI context, not for snapshot)
  if (input.top_spenders?.length > 0) {
    context.push(`Top spenders: ${input.top_spenders.map(s => `${fmtCurrency(s.payment)} on ${s.table_name} (${s.covers} covers, ${s.items.slice(0, 2).join(' + ')})`).join('; ')}`);
  }
  if (input.known_vips?.length > 0) {
    context.push(`Known VIPs: ${input.known_vips.map(v => `${v.name}${v.is_vip ? ' (VIP)' : ''}, party of ${v.party_size}`).join('; ')}`);
  }

  // Server performance (for AI context — mentions top and bottom performers)
  if (input.servers?.length > 0) {
    const sorted = [...input.servers].sort((a, b) => b.net_sales - a.net_sales);
    const top3 = sorted.slice(0, 3);
    context.push(`Top servers by revenue: ${top3.map(s => `${s.name} ${fmtCurrency(s.net_sales)} (${s.covers} covers, ${s.checks} checks, ${s.tip_pct.toFixed(0)}% tips)`).join('; ')}`);
  }

  // Top menu items (for AI context — specials, trends)
  if (input.top_items?.length > 0) {
    context.push(`Top menu items: ${input.top_items.slice(0, 5).map(i => `${i.name} ${fmtCurrency(i.revenue)} (${i.quantity} sold)`).join('; ')}`);
  }

  // Voids / discounts (for AI context — operational flags)
  if (input.voids_total > 0) context.push(`Voids: ${fmtCurrency(input.voids_total)}`);
  if (input.discounts_total > 0) context.push(`Discounts: ${fmtCurrency(input.discounts_total)}`);

  // Triggers
  if (input.trigger_reasons.length > 0) {
    context.push(`Flagged items: ${input.trigger_reasons.join('; ')}`);
  }

  // Key numbers for AI reference (so it doesn't need to parse the snapshot)
  const numbers = `Net sales: ${fmtCurrency(input.net_sales)}, Covers: ${input.total_covers}, Avg check: ${fmtCurrency(input.avg_check)}, ` +
    `Checks: ${input.checks_count}, Avg party: ${input.avg_party_size.toFixed(1)}, ` +
    `Bev mix: ${input.beverage_pct.toFixed(0)}%, ` +
    `${input.vs_forecast_pct != null ? `vs Forecast: ${fmtPct(input.vs_forecast_pct)}, ` : ''}` +
    `${input.vs_sdlw_pct != null ? `vs SDLW: ${fmtPct(input.vs_sdlw_pct)}, ` : ''}` +
    `Labor: ${input.labor_pct.toFixed(1)}%, SPLH: ${fmtCurrency(input.splh)}, OT: ${input.ot_hours.toFixed(1)}h, ` +
    `Comps: ${fmtCurrency(input.total_comps)} (${input.comp_pct.toFixed(1)}%), ${input.comp_exception_count} exceptions` +
    `${input.voids_total > 0 ? `, Voids: ${fmtCurrency(input.voids_total)}` : ''}` +
    `${input.discounts_total > 0 ? `, Discounts: ${fmtCurrency(input.discounts_total)}` : ''}`;

  return `You are the operations analyst for ${input.venueName}. The financial snapshot is already printed above your narrative — do NOT restate the numbers table. Your job is to add the story.

Key numbers (for reference, already shown above): ${numbers}

Manager's inputs:
${context.map(l => `- ${l}`).join('\n')}

Write the manager's narrative in these sections. Use the section headers exactly as shown, each on its own line:

REVENUE & COMPS
Two to three sentences. What drove the number tonight — demand, mix, pricing? Put comps in context (within policy, any flags). Reference specific dollar amounts from the data.

LABOR
One to two sentences. Was staffing right for volume? OT justified? Any scheduling takeaway?

GUEST
One to two sentences. High-spend tables, VIP activity, celebrations. Use table numbers and spend amounts, not guest names. Skip if nothing notable.

ENTERTAINMENT
One sentence. Energy, highlights, crowd response. Skip entirely if no entertainment data.

KITCHEN
One to two sentences. Execution quality, ticket times, 86s, specials performance. Skip if nothing notable.

TEAM
Two to three sentences. FOH and BOH standouts by name. Development needs by name. Keep it specific.

ACTION ITEMS
Bullet list using •. Only items that need follow-up tomorrow. If nothing, write "None."

Rules:
- Write like a sharp GM — confident, direct, no filler
- Section headers in ALL CAPS on their own line, no bold, no markdown
- Keep the total narrative under 250 words
- Third person ("The venue..." not "We...")
- Do not wrap in quotes
- Return the narrative text only`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function generateClosingNarrative(
  input: ClosingNarrativeInput,
): Promise<string> {
  // Part 1: Deterministic financial snapshot
  const snapshot = buildFinancialSnapshot(input);

  // Part 2: AI narrative
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    temperature: 0.3,
    messages: [{ role: 'user', content: buildNarrativePrompt(input) }],
  });

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI');
  }

  const narrative = textBlock.text.trim();

  // Combine: snapshot + separator + narrative
  return `${snapshot}\n\n---\n\n${narrative}`;
}
