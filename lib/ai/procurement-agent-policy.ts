/**
 * Procurement Agent Policy Contract
 *
 * Central policy config + runtime validation + helper functions.
 * Follows the rez-agent-policy.ts pattern: typed policy, validation,
 * cached defaults, and decision helpers.
 *
 * The procurement agent operates within calibrated thresholds —
 * tunable rails, not optional rules.
 */

// ── Types ──────────────────────────────────────────────────────

export type AgentMode = 'advise' | 'auto_low' | 'full_auto';

export type SignalType =
  | 'par_breach'
  | 'pos_depletion'
  | 'cleaning_threshold'
  | 'packaging_burn'
  | 'linen_cycle'
  | 'equipment_wear'
  | 'new_venue'
  | 'schedule'
  | 'forecast';

export type EntityCode = 'shw' | 'shureprint' | 'ee_mercantile' | 'groundops' | 'external';

export type ApprovalTier = 'auto' | 'manager' | 'executive';

export interface ApprovalTierConfig {
  tier: ApprovalTier;
  max_amount: number;
  auto_execute: boolean;
}

export interface ProcurementAgentPolicy {
  policy_version: string;
  effective_date: string;

  // Agent behavior
  mode: AgentMode;
  enabled_signals: SignalType[];

  // Approval thresholds (calibrated, not optional)
  approval_tiers: ApprovalTierConfig[];

  // Entity routing defaults (category → entity)
  entity_routing: Record<string, EntityCode>;

  // Hard constraints — these are enforcement rails, never overridden
  hard_constraints: {
    never_auto_execute_above: number;
    require_scorecard_grade_min: string; // 'A', 'B', 'C', 'D'
    block_volatile_vendors: boolean;
    max_price_volatility_pct: number;
    min_vendor_deliveries_for_auto: number;
  };

  // Cross-venue bundling
  bundling: {
    enabled: boolean;
    window_hours: number;
    min_savings_pct: number;
  };
}

// ── Defaults ──────────────────────────────────────────────────

const DEFAULT_PROCUREMENT_AGENT_POLICY: ProcurementAgentPolicy = {
  policy_version: 'procurement-agent-v1',
  effective_date: '2026-03-14',

  mode: 'advise',
  enabled_signals: ['par_breach', 'forecast'],

  approval_tiers: [
    { tier: 'auto', max_amount: 500, auto_execute: true },
    { tier: 'manager', max_amount: 2500, auto_execute: false },
    { tier: 'executive', max_amount: 999999.99, auto_execute: false },
  ],

  entity_routing: {
    // Tabletop / Uniforms / Bar equipment / OS&E
    glassware: 'ee_mercantile',
    barware: 'ee_mercantile',
    tabletop: 'ee_mercantile',
    smallwares: 'ee_mercantile',
    uniforms: 'ee_mercantile',
    linens: 'ee_mercantile',
    furniture: 'ee_mercantile',
    equipment: 'ee_mercantile',
    // Packaging / Custom print
    packaging: 'shureprint',
    printed_materials: 'shureprint',
    branded_items: 'shureprint',
    // Consumables / Distributor items
    food: 'shw',
    beverage: 'shw',
    supplies: 'shw',
    disposables: 'shw',
    // Facilities / Cleaning
    cleaning: 'groundops',
    janitorial: 'groundops',
    maintenance: 'groundops',
  },

  hard_constraints: {
    never_auto_execute_above: 2500,
    require_scorecard_grade_min: 'C',
    block_volatile_vendors: true,
    max_price_volatility_pct: 15,
    min_vendor_deliveries_for_auto: 3,
  },

  bundling: {
    enabled: false,
    window_hours: 24,
    min_savings_pct: 3,
  },
};

// ── Validation ──────────────────────────────────────────────────

let cachedValidation: { valid: boolean; errors: string[] } | null = null;

export function validateProcurementAgentPolicy(
  policy: ProcurementAgentPolicy
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Tier validation
  if (policy.approval_tiers.length === 0) {
    errors.push('At least one approval tier is required.');
  }

  const tierNames = policy.approval_tiers.map((t) => t.tier);
  if (new Set(tierNames).size !== tierNames.length) {
    errors.push('Approval tier names must be unique.');
  }

  for (const tier of policy.approval_tiers) {
    if (tier.max_amount <= 0) {
      errors.push(`Tier "${tier.tier}" max_amount must be positive.`);
    }
    if (tier.auto_execute && tier.max_amount > policy.hard_constraints.never_auto_execute_above) {
      errors.push(
        `Tier "${tier.tier}" auto-executes up to $${tier.max_amount} but hard constraint caps auto-execute at $${policy.hard_constraints.never_auto_execute_above}.`
      );
    }
  }

  // Sorted by max_amount ascending
  const sorted = [...policy.approval_tiers].sort((a, b) => a.max_amount - b.max_amount);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].max_amount <= sorted[i - 1].max_amount) {
      errors.push('Approval tiers must have strictly increasing max_amount values.');
      break;
    }
  }

  // Hard constraints
  if (policy.hard_constraints.never_auto_execute_above <= 0) {
    errors.push('hard_constraints.never_auto_execute_above must be positive.');
  }
  if (
    policy.hard_constraints.max_price_volatility_pct < 0 ||
    policy.hard_constraints.max_price_volatility_pct > 100
  ) {
    errors.push('hard_constraints.max_price_volatility_pct must be within [0,100].');
  }

  const validGrades = ['A', 'B', 'C', 'D'];
  if (!validGrades.includes(policy.hard_constraints.require_scorecard_grade_min)) {
    errors.push('hard_constraints.require_scorecard_grade_min must be A, B, C, or D.');
  }

  // Bundling
  if (policy.bundling.window_hours <= 0) {
    errors.push('bundling.window_hours must be positive.');
  }
  if (policy.bundling.min_savings_pct < 0 || policy.bundling.min_savings_pct > 100) {
    errors.push('bundling.min_savings_pct must be within [0,100].');
  }

  return { valid: errors.length === 0, errors };
}

// ── Getters ──────────────────────────────────────────────────

export function getActiveProcurementAgentPolicy(): ProcurementAgentPolicy {
  if (!cachedValidation) {
    cachedValidation = validateProcurementAgentPolicy(DEFAULT_PROCUREMENT_AGENT_POLICY);
  }
  if (!cachedValidation.valid) {
    throw new Error(`Invalid procurement agent policy: ${cachedValidation.errors.join(' | ')}`);
  }
  return DEFAULT_PROCUREMENT_AGENT_POLICY;
}

export function getPolicyValidationStatus(): { valid: boolean; errors: string[] } {
  if (!cachedValidation) {
    cachedValidation = validateProcurementAgentPolicy(DEFAULT_PROCUREMENT_AGENT_POLICY);
  }
  return cachedValidation;
}

// ── Decision Helpers ──────────────────────────────────────────

/**
 * Classify an item's category to a Binyan entity code.
 * Uses the policy's entity_routing map with fallback to 'external'.
 */
export function classifyItemEntity(
  itemCategory: string,
  itemTags: string[] = []
): EntityCode {
  const policy = getActiveProcurementAgentPolicy();
  const normalized = itemCategory.toLowerCase().replace(/\s+/g, '_');

  // Direct category match
  if (normalized in policy.entity_routing) {
    return policy.entity_routing[normalized];
  }

  // Check tags
  for (const tag of itemTags) {
    const normalizedTag = tag.toLowerCase().replace(/\s+/g, '_');
    if (normalizedTag in policy.entity_routing) {
      return policy.entity_routing[normalizedTag];
    }
  }

  return 'external';
}

/**
 * Determine approval tier for a given PO amount.
 * Returns the lowest tier whose max_amount covers the PO value.
 */
export function determineApprovalTier(
  totalAmount: number,
  customTiers?: ApprovalTierConfig[]
): { tier: ApprovalTier; auto_execute: boolean } {
  const policy = getActiveProcurementAgentPolicy();
  const tiers = (customTiers || policy.approval_tiers).sort(
    (a, b) => a.max_amount - b.max_amount
  );

  for (const t of tiers) {
    if (totalAmount <= t.max_amount) {
      // Enforce hard constraint: never auto-execute above cap
      const canAutoExecute =
        t.auto_execute && totalAmount <= policy.hard_constraints.never_auto_execute_above;
      return { tier: t.tier, auto_execute: canAutoExecute };
    }
  }

  // Above all tiers → executive, no auto-execute
  return { tier: 'executive', auto_execute: false };
}

/**
 * Check if the agent should auto-execute based on mode and tier.
 */
export function shouldAutoExecute(
  mode: AgentMode,
  tier: ApprovalTier,
  autoExecuteAllowed: boolean
): boolean {
  if (mode === 'advise') return false;
  if (mode === 'auto_low') return tier === 'auto' && autoExecuteAllowed;
  if (mode === 'full_auto') return (tier === 'auto' || tier === 'manager') && autoExecuteAllowed;
  return false;
}

/**
 * Check if a vendor's scorecard grade meets the minimum for auto-execution.
 */
export function vendorMeetsAutoExecuteGrade(vendorGrade: string): boolean {
  const policy = getActiveProcurementAgentPolicy();
  const gradeOrder: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
  const minGrade = gradeOrder[policy.hard_constraints.require_scorecard_grade_min] || 0;
  const actualGrade = gradeOrder[vendorGrade] || 0;
  return actualGrade >= minGrade;
}
