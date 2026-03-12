/**
 * Rez Agent Policy Contract
 *
 * Central policy config + runtime validation + helper functions used by
 * posture/evaluate routes to enforce safe autonomous behavior.
 */

export type RiskBand = 'low' | 'medium' | 'high';
export type AgentDecision = 'accept' | 'offer_alternate' | 'waitlist' | 'deny';

export interface RezAgentPolicy {
  policy_version: string;
  effective_date: string;
  objectives: {
    maximize_expected_revenue: { weight: number };
    protect_service_quality: { weight: number };
    preserve_future_optionality: { weight: number };
    guest_relationship_value: { weight: number };
    fairness_and_access: { weight: number };
  };
  hard_constraints: {
    stress_score_max: number;
    no_show_risk_max_without_deposit: number;
    min_capacity_buffer_pct_for_prime_slots: number;
    vip_never_auto_deny: boolean;
    legal_compliance_required: boolean;
    deny_if_confidence_below: number;
  };
  automation_tiers: {
    active_tier: 'tier_0_advice_only' | 'tier_1_low_risk_auto' | 'tier_2_bounded_autonomy';
  };
  exploration: {
    enabled: boolean;
    max_traffic_share_pct: number;
  };
  learning_loop: {
    max_threshold_change_per_week_pct: number;
  };
}

const DEFAULT_REZ_AGENT_POLICY: RezAgentPolicy = {
  policy_version: 'rez-agent-v1',
  effective_date: '2026-03-11',
  objectives: {
    maximize_expected_revenue: { weight: 0.45 },
    protect_service_quality: { weight: 0.25 },
    preserve_future_optionality: { weight: 0.15 },
    guest_relationship_value: { weight: 0.10 },
    fairness_and_access: { weight: 0.05 },
  },
  hard_constraints: {
    stress_score_max: 82,
    no_show_risk_max_without_deposit: 0.34,
    min_capacity_buffer_pct_for_prime_slots: 8,
    vip_never_auto_deny: true,
    legal_compliance_required: true,
    deny_if_confidence_below: 0.40,
  },
  automation_tiers: {
    active_tier: 'tier_0_advice_only',
  },
  exploration: {
    enabled: true,
    max_traffic_share_pct: 5,
  },
  learning_loop: {
    max_threshold_change_per_week_pct: 10,
  },
};

let cachedValidation: { valid: boolean; errors: string[] } | null = null;

export function validateRezAgentPolicy(policy: RezAgentPolicy): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const objectiveWeights = [
    policy.objectives.maximize_expected_revenue.weight,
    policy.objectives.protect_service_quality.weight,
    policy.objectives.preserve_future_optionality.weight,
    policy.objectives.guest_relationship_value.weight,
    policy.objectives.fairness_and_access.weight,
  ];
  const weightSum = objectiveWeights.reduce((s, w) => s + w, 0);

  if (objectiveWeights.some((w) => w < 0 || w > 1)) {
    errors.push('Objective weights must be within [0,1].');
  }
  if (Math.abs(weightSum - 1) > 0.001) {
    errors.push(`Objective weights must sum to 1.0 (actual: ${weightSum.toFixed(3)}).`);
  }
  if (policy.hard_constraints.stress_score_max < 0 || policy.hard_constraints.stress_score_max > 100) {
    errors.push('hard_constraints.stress_score_max must be within [0,100].');
  }
  if (policy.hard_constraints.no_show_risk_max_without_deposit < 0
    || policy.hard_constraints.no_show_risk_max_without_deposit > 1
  ) {
    errors.push('hard_constraints.no_show_risk_max_without_deposit must be within [0,1].');
  }
  if (policy.hard_constraints.deny_if_confidence_below < 0
    || policy.hard_constraints.deny_if_confidence_below > 1
  ) {
    errors.push('hard_constraints.deny_if_confidence_below must be within [0,1].');
  }
  if (policy.exploration.max_traffic_share_pct < 0 || policy.exploration.max_traffic_share_pct > 100) {
    errors.push('exploration.max_traffic_share_pct must be within [0,100].');
  }
  if (policy.learning_loop.max_threshold_change_per_week_pct < 0
    || policy.learning_loop.max_threshold_change_per_week_pct > 100
  ) {
    errors.push('learning_loop.max_threshold_change_per_week_pct must be within [0,100].');
  }

  return { valid: errors.length === 0, errors };
}

export function getActiveRezAgentPolicy(): RezAgentPolicy {
  if (!cachedValidation) {
    cachedValidation = validateRezAgentPolicy(DEFAULT_REZ_AGENT_POLICY);
  }
  if (!cachedValidation.valid) {
    throw new Error(`Invalid rez agent policy: ${cachedValidation.errors.join(' | ')}`);
  }
  return DEFAULT_REZ_AGENT_POLICY;
}

export function getPolicyValidationStatus(): { valid: boolean; errors: string[] } {
  if (!cachedValidation) {
    cachedValidation = validateRezAgentPolicy(DEFAULT_REZ_AGENT_POLICY);
  }
  return cachedValidation;
}

export function classifyRiskBand(stressScore: number, modelConfidence: number): RiskBand {
  if (stressScore <= 60 && modelConfidence >= 0.75) return 'low';
  if (stressScore <= 75 && modelConfidence >= 0.60) return 'medium';
  return 'high';
}

export function shouldAutoExecute(
  tier: RezAgentPolicy['automation_tiers']['active_tier'],
  decision: AgentDecision,
  riskBand: RiskBand,
): boolean {
  if (tier === 'tier_0_advice_only') return false;
  if (tier === 'tier_1_low_risk_auto') {
    return riskBand === 'low' && (decision === 'accept' || decision === 'offer_alternate');
  }
  if (tier === 'tier_2_bounded_autonomy') {
    return riskBand !== 'high' && decision !== 'deny';
  }
  return false;
}
