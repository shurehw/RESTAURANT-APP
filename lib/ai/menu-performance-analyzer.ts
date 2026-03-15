/**
 * Menu Performance Analyzer
 *
 * Pure analysis engine — detects margin breaches, underperformers,
 * cannibalization, menu bloat, and comp set gaps. No actions taken here;
 * the menu agent orchestrator consumes these findings to generate
 * recommendations and execute within policy rails.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getMenuItemPerformance,
  getMenuMarginHealth,
  getContributionMargins,
  getDemandElasticity,
  getMenuItemSurfaces,
} from '@/lib/database/menu-agent';
import { getCompSetPriceMap, getCompSetPriceChanges } from '@/lib/database/comp-set';
import type { MenuAgentPolicy, MenuSignalType } from './menu-agent-policy';

// ── Types ──────────────────────────────────────────────────────

export interface MarginBreach {
  recipe_id: string;
  recipe_name: string;
  item_category: string;
  menu_price: number;
  cost_per_unit: number;
  actual_food_cost_pct: number;
  target_food_cost_pct: number;
  breach_pct: number;
  suggested_price: number;
  severity: 'warning' | 'critical';
  surface: string | null;
  is_market_price: boolean;
}

export interface UnderperformerItem {
  recipe_id: string;
  recipe_name: string;
  item_category: string;
  velocity_per_week: number;
  contribution_margin_per_week: number;
  gp_per_unit: number;
  trend: string;
  trend_pct: number | null;
  days_observed: number;
  reason: string;
}

export interface CannibalizationPair {
  item_a: { recipe_id: string; name: string; category: string; velocity: number };
  item_b: { recipe_id: string; name: string; category: string; velocity: number };
  correlation_score: number;
  reasoning: string;
}

export interface CompSetGap {
  recipe_id: string;
  recipe_name: string;
  our_price: number;
  comp_median: number;
  comp_low: number;
  comp_high: number;
  headroom: number;
  direction: 'underpriced' | 'overpriced';
  comp_count: number;
}

export interface MenuAnalysis {
  venue_id: string;
  analysis_date: string;
  signals_detected: MenuSignalType[];
  margin_breaches: MarginBreach[];
  underperformers: UnderperformerItem[];
  bloat_assessment: {
    total_items: number;
    max_recommended: number | null;
    is_bloated: boolean;
    categories: Record<string, number>;
  };
  cannibalization_pairs: CannibalizationPair[];
  comp_set_gaps: CompSetGap[];
  comp_set_price_shifts: any[];
  elasticity_data: any[];
  overall_health_score: number;
}

// ── Main Analysis ──────────────────────────────────────────────

export async function analyzeMenuPerformance(
  venueId: string,
  orgId: string,
  policy: MenuAgentPolicy
): Promise<MenuAnalysis> {
  const enabledSignals = policy.enabled_signals;

  // Parallel data fetch
  const [performance, marginHealth, surfaces, compPositions, compShifts, elasticity] =
    await Promise.all([
      getMenuItemPerformance(venueId),
      getMenuMarginHealth(venueId),
      getMenuItemSurfaces(venueId),
      enabledSignals.includes('comp_set_gap')
        ? getCompSetPriceMap(venueId)
        : Promise.resolve([]),
      enabledSignals.includes('comp_set_gap')
        ? getCompSetPriceChanges(venueId, 30)
        : Promise.resolve([]),
      getDemandElasticity(venueId),
    ]);

  const surfaceMap = new Map(surfaces.map((s) => [s.recipe_id, s]));
  const signalsDetected: MenuSignalType[] = [];

  // 1. Margin breaches
  let marginBreaches: MarginBreach[] = [];
  if (enabledSignals.includes('margin_breach')) {
    marginBreaches = detectMarginBreaches(marginHealth, surfaceMap);
    if (marginBreaches.length > 0) signalsDetected.push('margin_breach');
  }

  // 2. Underperformers
  let underperformers: UnderperformerItem[] = [];
  if (enabledSignals.includes('underperformer')) {
    underperformers = detectUnderperformers(performance, policy);
    if (underperformers.length > 0) signalsDetected.push('underperformer');
  }

  // 3. Menu bloat
  const bloatAssessment = assessMenuBloat(performance, policy);
  if (enabledSignals.includes('menu_bloat') && bloatAssessment.is_bloated) {
    signalsDetected.push('menu_bloat');
  }

  // 4. Cannibalization (AI-assisted)
  let cannibalizationPairs: CannibalizationPair[] = [];
  if (enabledSignals.includes('cannibalization') && performance.length >= 4) {
    cannibalizationPairs = await detectCannibalization(venueId, performance, policy);
    if (cannibalizationPairs.length > 0) signalsDetected.push('cannibalization');
  }

  // 5. Comp set gaps
  let compSetGaps: CompSetGap[] = [];
  if (enabledSignals.includes('comp_set_gap') && compPositions.length > 0) {
    compSetGaps = detectCompSetGaps(compPositions);
    if (compSetGaps.length > 0) signalsDetected.push('comp_set_gap');
  }

  // Health score (0-100)
  const healthScore = calculateHealthScore(
    marginBreaches,
    underperformers,
    bloatAssessment,
    performance.length
  );

  return {
    venue_id: venueId,
    analysis_date: new Date().toISOString().split('T')[0],
    signals_detected: signalsDetected,
    margin_breaches: marginBreaches,
    underperformers,
    bloat_assessment: bloatAssessment,
    cannibalization_pairs: cannibalizationPairs,
    comp_set_gaps: compSetGaps,
    comp_set_price_shifts: compShifts,
    elasticity_data: elasticity,
    overall_health_score: healthScore,
  };
}

// ── Margin Breach Detection ──────────────────────────────────

function detectMarginBreaches(
  marginHealth: any[],
  surfaceMap: Map<string, any>
): MarginBreach[] {
  return marginHealth
    .filter(
      (r: any) =>
        r.margin_status === 'warning' || r.margin_status === 'critical'
    )
    .map((r: any) => {
      const surface = surfaceMap.get(r.recipe_id);
      return {
        recipe_id: r.recipe_id,
        recipe_name: r.recipe_name,
        item_category: r.item_category || 'uncategorized',
        menu_price: r.menu_price,
        cost_per_unit: r.cost_per_unit,
        actual_food_cost_pct: r.actual_food_cost_pct,
        target_food_cost_pct: r.food_cost_target,
        breach_pct: r.breach_pct,
        suggested_price: r.suggested_price,
        severity: (r.margin_status === 'critical' ? 'critical' : 'warning') as 'critical' | 'warning',
        surface: surface?.surface || null,
        is_market_price: surface?.is_market_price || false,
      };
    })
    .sort((a: MarginBreach, b: MarginBreach) => b.breach_pct - a.breach_pct);
}

// ── Underperformer Detection ──────────────────────────────────

function detectUnderperformers(
  performance: any[],
  policy: MenuAgentPolicy
): UnderperformerItem[] {
  const minVelocity = policy.composition.min_item_velocity_per_week;
  const minMargin = policy.composition.min_contribution_margin_dollars;
  const minDays = policy.hard_constraints.min_observation_days_before_action;

  return performance
    .filter((p: any) => {
      // Must have enough observation days
      if (p.days_observed < minDays) return false;

      const lowVelocity = p.velocity_per_week < minVelocity;
      const lowMargin = p.gp_per_unit < minMargin;
      const declining = p.trend === 'declining' && (p.trend_pct || 0) < -20;

      // Underperformer: low on both velocity AND margin, or declining fast
      return (lowVelocity && lowMargin) || (declining && lowMargin);
    })
    .map((p: any) => {
      const reasons: string[] = [];
      if (p.velocity_per_week < minVelocity) {
        reasons.push(
          `velocity ${p.velocity_per_week}/wk below minimum ${minVelocity}/wk`
        );
      }
      if (p.gp_per_unit < minMargin) {
        reasons.push(`GP $${p.gp_per_unit}/unit below minimum $${minMargin}`);
      }
      if (p.trend === 'declining') {
        reasons.push(`declining ${Math.abs(p.trend_pct || 0)}% over 30 days`);
      }

      return {
        recipe_id: p.recipe_id,
        recipe_name: p.recipe_name,
        item_category: p.item_category || 'uncategorized',
        velocity_per_week: p.velocity_per_week,
        contribution_margin_per_week: p.contribution_margin_per_week,
        gp_per_unit: p.gp_per_unit,
        trend: p.trend,
        trend_pct: p.trend_pct,
        days_observed: p.days_observed,
        reason: reasons.join('; '),
      };
    })
    .sort(
      (a: UnderperformerItem, b: UnderperformerItem) =>
        a.contribution_margin_per_week - b.contribution_margin_per_week
    );
}

// ── Menu Bloat Assessment ──────────────────────────────────

function assessMenuBloat(
  performance: any[],
  policy: MenuAgentPolicy
): { total_items: number; max_recommended: number | null; is_bloated: boolean; categories: Record<string, number> } {
  const categories: Record<string, number> = {};
  for (const p of performance) {
    const cat = p.item_category || 'uncategorized';
    categories[cat] = (categories[cat] || 0) + 1;
  }

  const maxSize = policy.composition.max_menu_size;
  const isBloated = maxSize != null && performance.length > maxSize;

  return {
    total_items: performance.length,
    max_recommended: maxSize,
    is_bloated: isBloated,
    categories,
  };
}

// ── Cannibalization Detection (AI-Assisted) ──────────────────

async function detectCannibalization(
  venueId: string,
  performance: any[],
  policy: MenuAgentPolicy
): Promise<CannibalizationPair[]> {
  // Pre-filter: only check items in same category with similar price points
  const candidates: Array<{ a: any; b: any }> = [];
  for (let i = 0; i < performance.length; i++) {
    for (let j = i + 1; j < performance.length; j++) {
      const a = performance[i];
      const b = performance[j];

      // Same category
      if (a.item_category !== b.item_category) continue;

      // Similar price (within 30%)
      if (!a.menu_price || !b.menu_price) continue;
      const priceRatio = Math.min(a.menu_price, b.menu_price) / Math.max(a.menu_price, b.menu_price);
      if (priceRatio < 0.70) continue;

      candidates.push({ a, b });
    }
  }

  if (candidates.length === 0) return [];

  // Limit to top 20 candidates to keep AI costs reasonable
  const topCandidates = candidates.slice(0, 20);

  try {
    const anthropic = new Anthropic();
    const candidateDescriptions = topCandidates.map(
      (c, idx) =>
        `${idx + 1}. "${c.a.recipe_name}" ($${c.a.menu_price}, ${c.a.velocity_per_week}/wk) vs "${c.b.recipe_name}" ($${c.b.menu_price}, ${c.b.velocity_per_week}/wk) [${c.a.item_category}]`
    );

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a menu engineering expert for high-end restaurants. Analyze these menu item pairs that share the same category and similar price points. Identify which pairs are likely cannibalizing each other — meaning guests choose one OR the other, never both, reducing overall category revenue.

Candidates:
${candidateDescriptions.join('\n')}

For each cannibalizing pair, explain why. Consider: similar proteins, similar preparations, similar flavor profiles, or similar positioning.

Respond in JSON only:
[
  {
    "pair_index": 1,
    "correlation_score": 0.85,
    "reasoning": "Both are seafood entrees with similar preparation..."
  }
]

Return empty array [] if no cannibalization detected. Only flag pairs with high confidence.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const aiResults = JSON.parse(jsonMatch[0]);

    return aiResults
      .filter((r: any) => r.correlation_score >= policy.composition.cannibalization_correlation_threshold)
      .map((r: any) => {
        const candidate = topCandidates[r.pair_index - 1];
        if (!candidate) return null;
        return {
          item_a: {
            recipe_id: candidate.a.recipe_id,
            name: candidate.a.recipe_name,
            category: candidate.a.item_category,
            velocity: candidate.a.velocity_per_week,
          },
          item_b: {
            recipe_id: candidate.b.recipe_id,
            name: candidate.b.recipe_name,
            category: candidate.b.item_category,
            velocity: candidate.b.velocity_per_week,
          },
          correlation_score: r.correlation_score,
          reasoning: r.reasoning,
        };
      })
      .filter(Boolean) as CannibalizationPair[];
  } catch (err) {
    console.error('[MenuAnalyzer] Cannibalization detection error:', err);
    return [];
  }
}

// ── Comp Set Gap Detection ──────────────────────────────────

function detectCompSetGaps(
  positions: any[]
): CompSetGap[] {
  return positions
    .filter((p: any) => Math.abs(p.headroom) > 2) // ignore <$2 gaps
    .map((p: any) => ({
      recipe_id: p.recipe_id,
      recipe_name: p.recipe_name,
      our_price: p.our_price,
      comp_median: p.comp_median,
      comp_low: p.comp_low,
      comp_high: p.comp_high,
      headroom: p.headroom,
      direction: p.headroom > 0 ? 'underpriced' as const : 'overpriced' as const,
      comp_count: p.comp_prices.length,
    }))
    .sort((a: CompSetGap, b: CompSetGap) => Math.abs(b.headroom) - Math.abs(a.headroom));
}

// ── Health Score ──────────────────────────────────────────────

function calculateHealthScore(
  breaches: MarginBreach[],
  underperformers: UnderperformerItem[],
  bloat: { is_bloated: boolean; total_items: number },
  totalItems: number
): number {
  if (totalItems === 0) return 100;

  let score = 100;

  // Margin breaches: -5 per warning, -10 per critical
  const warnings = breaches.filter((b) => b.severity === 'warning').length;
  const criticals = breaches.filter((b) => b.severity === 'critical').length;
  score -= warnings * 5;
  score -= criticals * 10;

  // Underperformers: -3 each
  score -= underperformers.length * 3;

  // Bloat: -10 if bloated
  if (bloat.is_bloated) score -= 10;

  // Scale by proportion of affected items
  const affectedPct = (breaches.length + underperformers.length) / totalItems;
  if (affectedPct > 0.3) score -= 15; // >30% of menu has issues

  return Math.max(0, Math.min(100, Math.round(score)));
}
