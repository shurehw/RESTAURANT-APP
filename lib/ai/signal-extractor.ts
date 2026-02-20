/**
 * Signal Extractor — AI-powered entity extraction + tone scoring from manager attestation text
 *
 * Runs post-submit. Single AI call extracts:
 *   Signals:
 *   - employee_mention: staff named with context (standout/development/issue)
 *   - action_commitment: forward-looking promises ("will add server Friday")
 *   - menu_item: specific items mentioned (86'd, specials, popular)
 *   - operational_issue: equipment, systems, process breakdowns
 *   - guest_insight: VIP mentions, regulars, notable interactions
 *   - staffing_signal: call-outs, coverage gaps, scheduling problems
 *
 *   Tone (1-5 each):
 *   - detail_depth: names, numbers, tables vs. vague generalizations
 *   - accountability: "I decided" vs "it happened"
 *   - action_orientation: proposes solutions vs. just reports
 *   - follow_through: references prior commitments, tracks outcomes
 *   - balance: positive recognition + constructive critique vs. one-sided
 *   - engagement: thoughtful reflection vs. minimal checkbox effort
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalType =
  | 'employee_mention'
  | 'action_commitment'
  | 'menu_item'
  | 'operational_issue'
  | 'guest_insight'
  | 'staffing_signal';

export type MentionSentiment = 'positive' | 'negative' | 'neutral' | 'actionable';
export type CommitmentStatus = 'open' | 'due' | 'fulfilled' | 'unfulfilled' | 'superseded';

export interface ExtractedSignal {
  signal_type: SignalType;
  extracted_text: string;
  source_field: string;
  confidence: number;
  entity_name: string | null;
  entity_type: string | null;
  mention_sentiment: MentionSentiment | null;
  mention_context: string | null;
  commitment_text: string | null;
  commitment_target_date: string | null; // YYYY-MM-DD or null
}

export interface OwnershipScores {
  // Scored dimensions (0-10)
  narrative_depth: number;     // Concrete numbers, cause/effect chains, operational decisions described
  ownership: number;           // "I adjusted" vs "we were busy"; personal corrective actions
  variance_awareness: number;  // References forecast, SDLW, pacing; identifies WHY the number was off
  signal_density: number;      // Named employees, menu items, table refs, dollar amounts per field

  // Tone sub-metrics (0-10)
  command_tone: number;        // Decisive, direct language vs. hedging/passive voice
  energy_alignment: number;    // Writing urgency matches the performance data (bad night = concerned, not casual)

  // Boolean flags
  avoidance_flag: boolean;     // Vague language masking a bad night ("overall good", "smooth night")
  corrective_action_flag: boolean; // Manager describes actions they took to fix problems in real time
  variance_reference_flag: boolean; // Explicitly references forecast/SDLW/benchmark data
  blame_shift_flag: boolean;   // Deflects to external factors without acknowledging management levers

  // Composite
  overall_command_score: number; // 0-10 weighted composite
  rationale: string;            // 2-3 sentence honest assessment
}

export interface ExtractionResult {
  signals: ExtractedSignal[];
  ownership: OwnershipScores | null;
}

export interface SignalExtractionInput {
  attestation_id: string;
  venue_id: string;
  business_date: string;
  venue_name: string;
  submitted_by?: string; // auth.users ID of the manager who submitted

  // All text fields from the attestation (field_name → text content)
  fields: Record<string, string | null>;

  // Structured data for cross-reference (helps AI distinguish employee names from other nouns)
  known_servers?: string[];
  known_menu_items?: string[];
}

// ---------------------------------------------------------------------------
// The 24 text fields we extract from, grouped by module
// ---------------------------------------------------------------------------

const TEXT_FIELDS: Record<string, string[]> = {
  revenue: [
    'revenue_driver', 'revenue_mgmt_impact', 'revenue_lost_opportunity',
    'revenue_demand_signal', 'revenue_quality', 'revenue_action', 'revenue_notes',
  ],
  comps: ['comp_driver', 'comp_pattern', 'comp_compliance', 'comp_notes'],
  labor: [
    'labor_foh_coverage', 'labor_boh_performance', 'labor_decision',
    'labor_change', 'labor_notes', 'labor_foh_notes', 'labor_boh_notes',
  ],
  incidents: ['incident_notes'],
  coaching: [
    'coaching_foh_standout', 'coaching_foh_development',
    'coaching_boh_standout', 'coaching_boh_development',
    'coaching_team_focus', 'coaching_notes',
  ],
  guest: ['guest_vip_notable', 'guest_experience', 'guest_opportunity', 'guest_notes'],
  entertainment: ['entertainment_notes'],
  culinary: ['culinary_notes'],
};

// ---------------------------------------------------------------------------
// Build extraction prompt
// ---------------------------------------------------------------------------

function buildExtractionPrompt(input: SignalExtractionInput): string {
  // Collect all non-empty text fields
  const fieldEntries: Array<{ field: string; module: string; text: string }> = [];

  for (const [module, fields] of Object.entries(TEXT_FIELDS)) {
    for (const field of fields) {
      const text = input.fields[field];
      if (text && text.trim().length >= 10) {
        fieldEntries.push({ field, module, text: text.trim() });
      }
    }
  }

  if (fieldEntries.length === 0) {
    return ''; // Nothing to extract from
  }

  const fieldBlock = fieldEntries
    .map(e => `[${e.field}] (${e.module})\n${e.text}`)
    .join('\n\n');

  const knownServersBlock = input.known_servers?.length
    ? `\nKnown servers/staff tonight: ${input.known_servers.join(', ')}`
    : '';

  const knownItemsBlock = input.known_menu_items?.length
    ? `\nKnown menu items tonight: ${input.known_menu_items.join(', ')}`
    : '';

  return `You are an operations intelligence analyst. Extract structured signals from a restaurant manager's nightly attestation.

Venue: ${input.venue_name}
Date: ${input.business_date}${knownServersBlock}${knownItemsBlock}

MANAGER'S TEXT INPUTS (field name and module in brackets):

${fieldBlock}

EXTRACT these signal types:

1. **employee_mention** — Any person named by the manager. Include:
   - entity_name: Their name exactly as written (first name or full name)
   - entity_type: role if identifiable (server, bartender, host, line_cook, prep, expo, manager, busser, etc.)
   - mention_sentiment: positive (standout/praise), negative (issue/concern), neutral (just mentioned), actionable (needs follow-up)
   - mention_context: 1 sentence explaining WHY they were mentioned

2. **action_commitment** — Forward-looking statements where the manager commits to doing something. Look for: "will", "going to", "plan to", "need to", "tomorrow", "next shift", "next week". Include:
   - commitment_text: The specific action promised
   - commitment_target_date: YYYY-MM-DD if a date/timeframe is mentioned, otherwise null
   - entity_name: Person responsible if mentioned, otherwise null

3. **menu_item** — Specific menu items, dishes, or drinks mentioned. Include:
   - entity_name: Item name
   - entity_type: category if identifiable (entree, appetizer, cocktail, wine, dessert, special)
   - mention_context: Why it was mentioned (86'd, popular, quality issue, new special, etc.)

4. **operational_issue** — Equipment failures, system problems, process breakdowns. Include:
   - entity_name: What broke or failed (POS system, ice machine, dishwasher, etc.)
   - mention_context: What happened and impact

5. **guest_insight** — Notable guest mentions, VIP interactions, celebrations. Include:
   - entity_name: Guest identifier if given (first name, table number, "regular", etc.) — NEVER extract full names of guests for privacy
   - mention_context: What happened (birthday, VIP treatment, complaint, etc.)
   - mention_sentiment: positive (great experience), negative (complaint/issue), neutral (informational)

6. **staffing_signal** — Staffing-level observations (call-outs, no-shows, overstaffed, understaffed). Include:
   - entity_name: Position or area affected if mentioned
   - mention_context: What happened and impact
   - mention_sentiment: negative (short/issue), neutral (adequate), positive (well-staffed)

RULES:
- Only extract signals you are confident about (confidence >= 0.7)
- One signal per distinct entity/action — don't duplicate
- Use the exact source_field name for each signal
- If the same employee is mentioned in multiple fields, create separate signals for each (different context)
- If text is vague ("staff did well"), skip it — we want specific, actionable signals
- Do NOT extract from acknowledged/checkbox fields — only from text inputs

ALSO evaluate the manager's OPERATIONAL OWNERSHIP. This is not about writing quality — it's about whether this person is operating like an owner or clocking in.

Score these dimensions (0-10 each):

### narrative_depth (0-10)
Are concrete numbers, cause-effect chains, and operational decisions present?
- 0-2: "Busy night. Team did great." (no substance)
- 3-4: "We were busy, bar was slammed, cut two servers early." (some detail, no numbers)
- 5-6: "Covered 187 checks, bar hit $4,200, cut early at 10 PM" (numbers but no cause/effect)
- 7-8: "12% above forecast driven by late bottle service. Cut two servers at 8:45 after 2nd turn slowed." (numbers + decisions + causal reasoning)
- 9-10: Full operational picture — numbers, timing, decisions, impact, counterfactuals

### ownership (0-10)
Does the manager use "I decided/adjusted/held" or passive "it happened/we were/things got"?
- 0-2: Pure passive voice, no personal decisions mentioned
- 3-4: "We adjusted" (team-speak, no personal accountability)
- 5-6: Some "I" language but mostly observational
- 7-8: "I held Maria an extra hour — that generated $2,800. I should have prepped patio earlier."
- 9-10: Every decision explained with personal ownership, including mistakes

### variance_awareness (0-10)
Does the manager reference benchmarks — forecast, SDLW, pacing, targets?
- 0-2: No benchmark references at all
- 3-4: Vague ("we beat forecast")
- 5-6: One or two specific references ("15% above forecast")
- 7-8: Multiple benchmarks with context ("above forecast, below SDLW, demand felt 15-20% stronger than expected")
- 9-10: Full variance narrative — what moved, why, whether it's sustainable

### signal_density (0-10)
How many named entities per field? (employees, menu items, table numbers, dollar amounts, timestamps)
- 0-2: Zero names, zero numbers
- 3-4: 1-2 names or numbers across all fields
- 5-6: Named employees in coaching, some dollar refs
- 7-8: Named employees everywhere, table numbers, timestamps, dollar amounts
- 9-10: Every field rich with specific, actionable entities

### command_tone (0-10)
Is the language decisive and direct, or hedging and passive?
- 0-2: "I think maybe we could consider..." / "It might be worth looking at..."
- 5: Clear but flat: "Service was fine. Kitchen held up."
- 8-10: "Cut the bussers too early — won't repeat. Tony's going to retraining Friday. Table 42 needs follow-up."

### energy_alignment (0-10)
Does the writing urgency match performance? (Bad night should sound concerned. Great night should sound sharp, not complacent.)
- Low: Bad night but "everything was fine" → avoidance
- Low: Great night but "yeah it was busy" → disengagement
- High: Bad night + "here's exactly what went wrong and what I'm changing" → ownership
- High: Great night + "here's why it worked and how to replicate it" → command

### Boolean flags:
- **avoidance_flag**: TRUE if the manager uses vague language to mask a bad night ("overall good", "smooth night", "nothing major") when the data suggests otherwise. Be strict.
- **corrective_action_flag**: TRUE if the manager describes actions they took IN REAL TIME to address problems during service (not just "next time we'll...").
- **variance_reference_flag**: TRUE if the manager explicitly cites forecast, SDLW, budget %, or benchmark data.
- **blame_shift_flag**: TRUE if the manager attributes outcomes to external factors (weather, events, no-shows) WITHOUT acknowledging management levers they could have pulled.

### overall_command_score (0-10)
Weighted composite:
- narrative_depth × 2
- ownership × 3
- variance_awareness × 1
- signal_density × 1
- command_tone × 1.5
- energy_alignment × 1.5
Divide by 10. Round to one decimal.

Return a JSON object with two keys:
{
  "signals": [
    {
      "signal_type": "employee_mention" | "action_commitment" | "menu_item" | "operational_issue" | "guest_insight" | "staffing_signal",
      "extracted_text": "the exact phrase from the manager's text",
      "source_field": "the field name it came from",
      "confidence": 0.7 to 1.0,
      "entity_name": "normalized name" or null,
      "entity_type": "sub-type" or null,
      "mention_sentiment": "positive" | "negative" | "neutral" | "actionable" or null,
      "mention_context": "1 sentence why" or null,
      "commitment_text": "the specific promise" or null,
      "commitment_target_date": "YYYY-MM-DD" or null
    }
  ],
  "ownership": {
    "narrative_depth": 0-10,
    "ownership": 0-10,
    "variance_awareness": 0-10,
    "signal_density": 0-10,
    "command_tone": 0-10,
    "energy_alignment": 0-10,
    "avoidance_flag": true/false,
    "corrective_action_flag": true/false,
    "variance_reference_flag": true/false,
    "blame_shift_flag": true/false,
    "overall_command_score": 0-10 (weighted per formula above),
    "rationale": "2-3 sentences. Be direct. No softening."
  }
}

Return ONLY the JSON object, no wrapping text.`;
}

// ---------------------------------------------------------------------------
// Extract signals
// ---------------------------------------------------------------------------

export async function extractSignals(
  input: SignalExtractionInput,
): Promise<ExtractionResult> {
  const prompt = buildExtractionPrompt(input);

  if (!prompt) {
    return { signals: [], ownership: null };
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8000,
    temperature: 0.1, // Low temp for consistent extraction
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    console.error('[signal-extractor] No text response from AI');
    return { signals: [], ownership: null };
  }

  try {
    // Parse the JSON object — handle potential markdown wrapping
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonText);

    // Handle both old format (array) and new format ({ signals, ownership })
    let signals: ExtractedSignal[];
    let ownership: OwnershipScores | null = null;

    if (Array.isArray(parsed)) {
      signals = parsed;
    } else {
      signals = parsed.signals || [];
      ownership = parsed.ownership || null;
    }

    // Validate and filter signals
    signals = signals.filter(s => {
      if (!s.signal_type || !s.extracted_text || !s.source_field) return false;
      if (s.confidence < 0.7) return false;
      return true;
    });

    // Validate ownership scores (clamp 0-10)
    if (ownership) {
      const clamp = (v: number) => Math.max(0, Math.min(10, +(v || 0).toFixed(1)));
      ownership.narrative_depth = clamp(ownership.narrative_depth);
      ownership.ownership = clamp(ownership.ownership);
      ownership.variance_awareness = clamp(ownership.variance_awareness);
      ownership.signal_density = clamp(ownership.signal_density);
      ownership.command_tone = clamp(ownership.command_tone);
      ownership.energy_alignment = clamp(ownership.energy_alignment);
      ownership.overall_command_score = clamp(ownership.overall_command_score);
      ownership.avoidance_flag = !!ownership.avoidance_flag;
      ownership.corrective_action_flag = !!ownership.corrective_action_flag;
      ownership.variance_reference_flag = !!ownership.variance_reference_flag;
      ownership.blame_shift_flag = !!ownership.blame_shift_flag;
    }

    return { signals, ownership };
  } catch (parseError) {
    console.error('[signal-extractor] Failed to parse AI response:', parseError);
    console.error('[signal-extractor] Raw response:', textBlock.text.substring(0, 500));
    return { signals: [], ownership: null };
  }
}

// ---------------------------------------------------------------------------
// Store signals in database
// ---------------------------------------------------------------------------

export async function storeSignals(
  signals: ExtractedSignal[],
  attestationId: string,
  venueId: string,
  businessDate: string,
  submittedBy?: string,
): Promise<{ inserted: number; errors: string[] }> {
  if (signals.length === 0) {
    return { inserted: 0, errors: [] };
  }

  // Dynamic import to avoid circular deps
  const { getServiceClient } = await import('@/lib/supabase/service');
  const supabase = getServiceClient();

  const rows = signals.map(s => ({
    attestation_id: attestationId,
    venue_id: venueId,
    submitted_by: submittedBy || null,
    business_date: businessDate,
    signal_type: s.signal_type,
    extracted_text: s.extracted_text,
    source_field: s.source_field,
    confidence: s.confidence,
    entity_name: s.entity_name,
    entity_type: s.entity_type,
    mention_sentiment: s.mention_sentiment,
    mention_context: s.mention_context,
    commitment_text: s.commitment_text,
    commitment_target_date: s.commitment_target_date,
    commitment_status: s.signal_type === 'action_commitment' ? 'open' : null,
  }));

  const { error } = await (supabase as any)
    .from('attestation_signals')
    .insert(rows);

  if (error) {
    console.error('[signal-extractor] Insert error:', error);
    return { inserted: 0, errors: [error.message] };
  }

  return { inserted: rows.length, errors: [] };
}

// ---------------------------------------------------------------------------
// Full pipeline: extract + store (called post-submit)
// ---------------------------------------------------------------------------

export async function extractAndStoreSignals(
  input: SignalExtractionInput,
): Promise<{ extracted: number; stored: number; errors: string[]; ownership: OwnershipScores | null }> {
  const { signals, ownership } = await extractSignals(input);

  if (signals.length === 0 && !ownership) {
    return { extracted: 0, stored: 0, errors: [], ownership: null };
  }

  // Store signals
  const result = signals.length > 0
    ? await storeSignals(signals, input.attestation_id, input.venue_id, input.business_date, input.submitted_by)
    : { inserted: 0, errors: [] as string[] };

  // Store ownership scores on the attestation
  if (ownership) {
    try {
      const { getServiceClient } = await import('@/lib/supabase/service');
      const supabase = getServiceClient();
      await (supabase as any)
        .from('nightly_attestations')
        .update({ ownership_scores: ownership })
        .eq('id', input.attestation_id);
    } catch (err) {
      console.error('[signal-extractor] Failed to store ownership scores:', err);
      result.errors.push('Failed to store ownership scores');
    }
  }

  const flags = ownership ? [
    ownership.avoidance_flag ? 'AVOIDANCE' : null,
    ownership.blame_shift_flag ? 'BLAME-SHIFT' : null,
    ownership.corrective_action_flag ? 'corrective-action' : null,
    ownership.variance_reference_flag ? 'variance-aware' : null,
  ].filter(Boolean).join(', ') : '';

  console.log(
    `[signal-extractor] ${input.venue_name} ${input.business_date}: ` +
    `${signals.length} signals, ${result.inserted} stored` +
    (ownership ? ` | command: ${ownership.overall_command_score}/10 [${flags}]` : ''),
  );

  return {
    extracted: signals.length,
    stored: result.inserted,
    errors: result.errors,
    ownership,
  };
}
