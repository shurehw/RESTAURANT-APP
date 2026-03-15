/**
 * Menu Agent Policy Contract
 *
 * Central policy config + runtime validation + helper functions.
 * Follows the procurement-agent-policy.ts pattern: typed policy, validation,
 * cached defaults, and decision helpers.
 *
 * The menu agent operates within calibrated thresholds —
 * tunable rails, not optional rules.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export type MenuAgentMode = 'advise' | 'auto_low' | 'full_auto';

export type MenuSignalType =
  | 'margin_breach'
  | 'underperformer'
  | 'menu_bloat'
  | 'cannibalization'
  | 'comp_set_gap'
  | 'seasonality_shift';

export type MenuActionType =
  | 'price_increase'
  | 'price_decrease'
  | 'remove_item'
  | 'add_item'
  | 'substitute_ingredient'
  | 'reduce_prep'
  | 'reposition'
  | 'flag_cannibalization'
  | 'flag_sacred_cow';

export type MenuApprovalTier = 'auto' | 'manager' | 'executive';

export type MenuSurface =
  | 'printed_fixed'
  | 'printed_rotating'
  | 'insert'
  | 'digital'
  | 'verbal_only';

export interface MenuApprovalTierConfig {
  tier: MenuApprovalTier;
  max_price_delta_pct: number;
  auto_execute: boolean;
}

export interface MenuAgentPolicy {
  policy_version: string;
  effective_date: string;

  // Agent behavior
  mode: MenuAgentMode;
  enabled_signals: MenuSignalType[];

  // Price adjustment guardrails
  auto_price_band: {
    pct: number;    // max % auto-adjust for MP/digital items
    dollars: number; // max $ auto-adjust
  };

  // Approval thresholds (calibrated, not optional)
  approval_tiers: MenuApprovalTierConfig[];

  // Menu composition
  composition: {
    max_menu_size: number | null;
    min_contribution_margin_dollars: number;
    min_item_velocity_per_week: number;
    underperformer_observation_days: number;
    cannibalization_correlation_threshold: number;
  };

  // Hard constraints — enforcement rails, never overridden
  hard_constraints: {
    max_single_price_increase_pct: number;
    require_comp_set_validation_for_increases: boolean;
    never_auto_remove_sacred_items: boolean;
    min_observation_days_before_action: number;
  };

  // Reprint awareness
  reprint: {
    batch_to_reprint_window: boolean;
    mp_items_realtime: boolean;
    digital_items_realtime: boolean;
  };

  // Learning
  learning: {
    seasonality_window_days: number;
    elasticity_observation_days: number;
    min_price_changes_for_elasticity: number;
  };

  // Sacred items (never auto-remove, always flag for human review)
  sacred_recipe_ids: string[];

  // Comp set
  comp_set: {
    enabled: boolean;
    scan_frequency_days: number;
  };
}

// ── Defaults ──────────────────────────────────────────────────

const DEFAULT_MENU_AGENT_POLICY: MenuAgentPolicy = {
  policy_version: 'menu-agent-v1',
  effective_date: '2026-03-14',

  mode: 'advise',
  enabled_signals: ['margin_breach', 'underperformer', 'menu_bloat', 'comp_set_gap'],

  auto_price_band: {
    pct: 5.0,
    dollars: 2.0,
  },

  approval_tiers: [
    { tier: 'auto', max_price_delta_pct: 5, auto_execute: true },
    { tier: 'manager', max_price_delta_pct: 10, auto_execute: false },
    { tier: 'executive', max_price_delta_pct: 100, auto_execute: false },
  ],

  composition: {
    max_menu_size: null,
    min_contribution_margin_dollars: 8.0,
    min_item_velocity_per_week: 5.0,
    underperformer_observation_days: 21,
    cannibalization_correlation_threshold: 0.70,
  },

  hard_constraints: {
    max_single_price_increase_pct: 15,
    require_comp_set_validation_for_increases: true,
    never_auto_remove_sacred_items: true,
    min_observation_days_before_action: 14,
  },

  reprint: {
    batch_to_reprint_window: true,
    mp_items_realtime: true,
    digital_items_realtime: true,
  },

  learning: {
    seasonality_window_days: 90,
    elasticity_observation_days: 14,
    min_price_changes_for_elasticity: 3,
  },

  sacred_recipe_ids: [],

  comp_set: {
    enabled: false,
    scan_frequency_days: 14,
  },
};

// ── Validation ──────────────────────────────────────────────────

let cachedValidation: { valid: boolean; errors: string[] } | null = null;

export function validateMenuAgentPolicy(
  policy: MenuAgentPolicy
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
    if (tier.max_price_delta_pct <= 0) {
      errors.push(`Tier "${tier.tier}" max_price_delta_pct must be positive.`);
    }
    if (
      tier.auto_execute &&
      tier.max_price_delta_pct > policy.hard_constraints.max_single_price_increase_pct
    ) {
      errors.push(
        `Tier "${tier.tier}" auto-executes up to ${tier.max_price_delta_pct}% but hard constraint caps at ${policy.hard_constraints.max_single_price_increase_pct}%.`
      );
    }
  }

  // Sorted by max_price_delta_pct ascending
  const sorted = [...policy.approval_tiers].sort(
    (a, b) => a.max_price_delta_pct - b.max_price_delta_pct
  );
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].max_price_delta_pct <= sorted[i - 1].max_price_delta_pct) {
      errors.push('Approval tiers must have strictly increasing max_price_delta_pct.');
      break;
    }
  }

  // Hard constraints
  if (policy.hard_constraints.max_single_price_increase_pct <= 0) {
    errors.push('hard_constraints.max_single_price_increase_pct must be positive.');
  }
  if (policy.hard_constraints.min_observation_days_before_action < 1) {
    errors.push('hard_constraints.min_observation_days_before_action must be >= 1.');
  }

  // Composition
  if (policy.composition.min_contribution_margin_dollars < 0) {
    errors.push('composition.min_contribution_margin_dollars must be non-negative.');
  }
  if (policy.composition.min_item_velocity_per_week < 0) {
    errors.push('composition.min_item_velocity_per_week must be non-negative.');
  }

  // Price band
  if (policy.auto_price_band.pct < 0 || policy.auto_price_band.pct > 100) {
    errors.push('auto_price_band.pct must be within [0,100].');
  }
  if (policy.auto_price_band.dollars < 0) {
    errors.push('auto_price_band.dollars must be non-negative.');
  }

  return { valid: errors.length === 0, errors };
}

// ── Getters ──────────────────────────────────────────────────

export function getDefaultMenuAgentPolicy(): MenuAgentPolicy {
  if (!cachedValidation) {
    cachedValidation = validateMenuAgentPolicy(DEFAULT_MENU_AGENT_POLICY);
  }
  if (!cachedValidation.valid) {
    throw new Error(`Invalid menu agent policy: ${cachedValidation.errors.join(' | ')}`);
  }
  return DEFAULT_MENU_AGENT_POLICY;
}

/**
 * Load menu agent policy from DB settings, merged with defaults.
 */
export async function getActiveMenuAgentPolicy(orgId: string): Promise<MenuAgentPolicy> {
  const defaults = getDefaultMenuAgentPolicy();

  const supabase = getServiceClient();
  const { data } = await (supabase as any)
    .from('menu_agent_settings')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('effective_to', null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return defaults;

  return {
    ...defaults,
    mode: data.mode || defaults.mode,
    enabled_signals: data.enabled_signals || defaults.enabled_signals,
    auto_price_band: {
      pct: data.auto_price_band_pct ?? defaults.auto_price_band.pct,
      dollars: data.auto_price_band_dollars ?? defaults.auto_price_band.dollars,
    },
    composition: {
      ...defaults.composition,
      max_menu_size: data.max_menu_size ?? defaults.composition.max_menu_size,
      min_contribution_margin_dollars:
        data.min_contribution_margin_dollars ?? defaults.composition.min_contribution_margin_dollars,
      min_item_velocity_per_week:
        data.min_item_velocity_per_week ?? defaults.composition.min_item_velocity_per_week,
      underperformer_observation_days:
        data.underperformer_observation_days ?? defaults.composition.underperformer_observation_days,
      cannibalization_correlation_threshold:
        data.cannibalization_correlation_threshold ??
        defaults.composition.cannibalization_correlation_threshold,
    },
    hard_constraints: {
      ...defaults.hard_constraints,
      max_single_price_increase_pct:
        data.max_single_price_increase_pct ?? defaults.hard_constraints.max_single_price_increase_pct,
      require_comp_set_validation_for_increases:
        data.require_comp_set_validation ?? defaults.hard_constraints.require_comp_set_validation_for_increases,
    },
    sacred_recipe_ids: data.sacred_recipe_ids || defaults.sacred_recipe_ids,
    comp_set: {
      enabled: data.comp_set_scan_enabled ?? defaults.comp_set.enabled,
      scan_frequency_days: data.comp_set_scan_frequency_days ?? defaults.comp_set.scan_frequency_days,
    },
    learning: {
      ...defaults.learning,
      seasonality_window_days:
        data.seasonality_window_days ?? defaults.learning.seasonality_window_days,
      elasticity_observation_days:
        data.elasticity_observation_days ?? defaults.learning.elasticity_observation_days,
      min_price_changes_for_elasticity:
        data.min_price_changes_for_elasticity ?? defaults.learning.min_price_changes_for_elasticity,
    },
  };
}

// ── Decision Helpers ──────────────────────────────────────────

/**
 * Determine approval tier for a price change based on delta %.
 */
export function determineMenuApprovalTier(
  priceDeltaPct: number,
  policy: MenuAgentPolicy
): { tier: MenuApprovalTier; auto_execute: boolean } {
  const absDelta = Math.abs(priceDeltaPct);
  const tiers = [...policy.approval_tiers].sort(
    (a, b) => a.max_price_delta_pct - b.max_price_delta_pct
  );

  for (const t of tiers) {
    if (absDelta <= t.max_price_delta_pct) {
      // Enforce hard constraint
      const canAutoExecute =
        t.auto_execute &&
        absDelta <= policy.hard_constraints.max_single_price_increase_pct;
      return { tier: t.tier, auto_execute: canAutoExecute };
    }
  }

  return { tier: 'executive', auto_execute: false };
}

/**
 * Check if a price change can be auto-executed given mode, surface, and policy.
 */
export function canAutoExecutePriceChange(
  mode: MenuAgentMode,
  surface: MenuSurface,
  priceDeltaPct: number,
  priceDeltaDollars: number,
  policy: MenuAgentPolicy
): boolean {
  // Advise mode never auto-executes
  if (mode === 'advise') return false;

  // Only MP and digital items can auto-execute
  const isRealtime =
    (surface === 'digital' && policy.reprint.digital_items_realtime) ||
    (surface === 'verbal_only'); // verbal is always flexible
  const isMP = false; // MP check happens via is_market_price flag, not surface

  if (!isRealtime && !isMP) return false;

  // Check within auto band
  const withinPctBand = Math.abs(priceDeltaPct) <= policy.auto_price_band.pct;
  const withinDollarBand = Math.abs(priceDeltaDollars) <= policy.auto_price_band.dollars;
  if (!withinPctBand && !withinDollarBand) return false;

  // Check approval tier
  const { auto_execute } = determineMenuApprovalTier(priceDeltaPct, policy);
  if (!auto_execute) return false;

  // Mode check
  if (mode === 'auto_low') return true;
  if (mode === 'full_auto') return true;

  return false;
}

/**
 * Check if an item is sacred (never auto-remove).
 */
export function isItemSacred(recipeId: string, policy: MenuAgentPolicy): boolean {
  return policy.sacred_recipe_ids.includes(recipeId);
}

/**
 * Check if a price change should be batched to a reprint window.
 */
export function shouldBatchToReprint(
  surface: MenuSurface,
  isMarketPrice: boolean,
  policy: MenuAgentPolicy
): boolean {
  if (isMarketPrice && policy.reprint.mp_items_realtime) return false;
  if (surface === 'digital' && policy.reprint.digital_items_realtime) return false;
  if (surface === 'verbal_only') return false;
  return policy.reprint.batch_to_reprint_window;
}

/**
 * Check if a price increase exceeds the hard cap.
 */
export function exceedsHardCap(priceDeltaPct: number, policy: MenuAgentPolicy): boolean {
  return Math.abs(priceDeltaPct) > policy.hard_constraints.max_single_price_increase_pct;
}
