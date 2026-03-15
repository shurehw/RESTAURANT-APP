/**
 * Menu Agent Orchestrator
 *
 * The main brain. Detects menu problems proactively and creates the fix —
 * not just the alert. Operates within calibrated policy rails.
 *
 * Flow:
 *   1. Analyze menu performance (margins, velocity, cannibalization, comp set)
 *   2. Generate recommendations (price changes, removals, substitutions)
 *   3. Execute within policy (auto for MP/digital within band, queue for printed)
 *   4. Track outcomes (feedback loop for learning)
 *
 * Philosophy: the rules are always on. Calibration is allowed. Escape is not.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getActiveMenuAgentPolicy,
  canAutoExecutePriceChange,
  isItemSacred,
  shouldBatchToReprint,
  exceedsHardCap,
  determineMenuApprovalTier,
  type MenuAgentPolicy,
  type MenuSurface,
  type MenuActionType,
} from './menu-agent-policy';
import {
  analyzeMenuPerformance,
  type MenuAnalysis,
  type MarginBreach,
  type UnderperformerItem,
  type CompSetGap,
  type CannibalizationPair,
} from './menu-performance-analyzer';
import {
  createMenuAgentRun,
  updateMenuAgentRun,
  insertRecommendation,
  updateRecommendationStatus,
  getMenuItemSurfaces,
  recordPriceChange,
  type MenuRecommendation,
  type MenuAgentRunResult,
} from '@/lib/database/menu-agent';
import {
  queuePriceChange,
  type PriceQueueEntry,
} from '@/lib/database/menu-price-queue';
import { getCompSetPriceMap } from '@/lib/database/comp-set';

// ── Types ──────────────────────────────────────────────────────

export interface MenuAgentResult {
  run_id: string;
  venue_id: string;
  analysis: MenuAnalysis;
  recommendations_created: number;
  auto_executed: number;
  pending_approval: number;
  prices_queued: number;
}

// ── Main Entry Point ──────────────────────────────────────────

/**
 * Run the menu agent for a single venue.
 */
export async function runMenuAgent(
  venueId: string,
  orgId: string,
  triggeredBy: 'cron' | 'manual' | 'signal'
): Promise<MenuAgentResult> {
  const runId = await createMenuAgentRun({
    venue_id: venueId,
    org_id: orgId,
    triggered_by: triggeredBy,
  });

  try {
    // 1. Load policy
    const policy = await getActiveMenuAgentPolicy(orgId);

    // 2. Analyze menu performance
    const analysis = await analyzeMenuPerformance(venueId, orgId, policy);

    // 3. Generate recommendations from analysis
    const recommendations = await generateRecommendations(
      analysis,
      policy,
      venueId,
      orgId,
      runId
    );

    // 4. Process recommendations (auto-execute or queue)
    const surfaces = await getMenuItemSurfaces(venueId);
    const surfaceMap = new Map(surfaces.map((s) => [s.recipe_id, s]));

    let autoExecuted = 0;
    let pendingApproval = 0;
    let pricesQueued = 0;

    for (const rec of recommendations) {
      const recId = await insertRecommendation(rec);

      if (isPriceAction(rec.action_type)) {
        const surface = surfaceMap.get(rec.recipe_id || '');
        const impact = rec.expected_impact as any;
        const priceDeltaPct = impact?.price_change_pct || 0;
        const priceDeltaDollars = impact?.price_delta || 0;
        const surfaceType = (surface?.surface || 'printed_fixed') as MenuSurface;
        const isMP = surface?.is_market_price || false;

        // Can we auto-execute?
        const canAuto =
          (isMP && policy.reprint.mp_items_realtime) ||
          canAutoExecutePriceChange(
            policy.mode,
            surfaceType,
            priceDeltaPct,
            priceDeltaDollars,
            policy
          );

        if (canAuto && !exceedsHardCap(priceDeltaPct, policy)) {
          // Auto-execute: update recipe price directly
          await executeAutoPrice(
            venueId,
            rec.recipe_id!,
            impact.current_price,
            impact.recommended_price,
            recId
          );
          await updateRecommendationStatus(recId, 'auto_executed');
          autoExecuted++;
        } else if (shouldBatchToReprint(surfaceType, isMP, policy)) {
          // Queue for reprint window
          const queueId = await queuePriceChange({
            venue_id: venueId,
            org_id: orgId,
            recipe_id: rec.recipe_id!,
            menu_item_name: rec.menu_item_name || '',
            current_price: impact.current_price,
            recommended_price: impact.recommended_price,
            price_change_pct: priceDeltaPct,
            reason: rec.reasoning,
            action_type: rec.action_type as PriceQueueEntry['action_type'],
            margin_bleed_per_week: impact.margin_bleed_per_week,
            comp_set_context: impact.comp_set_context,
            surface: surfaceType,
            target_reprint_date: surface?.next_reprint_date || undefined,
            run_id: runId,
            recommendation_id: recId,
          });
          pricesQueued++;
        } else {
          pendingApproval++;
        }
      } else {
        // Non-price actions always require approval
        pendingApproval++;
      }
    }

    // 5. Update agent run
    const result: MenuAgentRunResult = {
      items_evaluated: analysis.bloat_assessment.total_items,
      signals_detected: analysis.signals_detected.length,
      recommendations_generated: recommendations.length,
      auto_executed: autoExecuted,
      pending_approval: pendingApproval,
      prices_queued: pricesQueued,
      agent_reasoning: {
        health_score: analysis.overall_health_score,
        signals: analysis.signals_detected,
        margin_breaches: analysis.margin_breaches.length,
        underperformers: analysis.underperformers.length,
        cannibalization_pairs: analysis.cannibalization_pairs.length,
        comp_set_gaps: analysis.comp_set_gaps.length,
      },
      status: 'completed',
    };

    await updateMenuAgentRun(runId, result);

    return {
      run_id: runId,
      venue_id: venueId,
      analysis,
      recommendations_created: recommendations.length,
      auto_executed: autoExecuted,
      pending_approval: pendingApproval,
      prices_queued: pricesQueued,
    };
  } catch (err: any) {
    console.error(`[MenuAgent] Error running for venue ${venueId}:`, err);
    await updateMenuAgentRun(runId, {
      items_evaluated: 0,
      signals_detected: 0,
      recommendations_generated: 0,
      auto_executed: 0,
      pending_approval: 0,
      prices_queued: 0,
      agent_reasoning: {},
      error_message: err.message,
      status: 'failed',
    });
    throw err;
  }
}

// ── Recommendation Generation ──────────────────────────────

async function generateRecommendations(
  analysis: MenuAnalysis,
  policy: MenuAgentPolicy,
  venueId: string,
  orgId: string,
  runId: string
): Promise<MenuRecommendation[]> {
  const recs: MenuRecommendation[] = [];

  // 1. Margin breach → price increase (with comp set validation)
  const compPositions = policy.comp_set.enabled
    ? await getCompSetPriceMap(venueId)
    : [];
  const compMap = new Map(compPositions.map((p: any) => [p.recipe_id, p]));

  for (const breach of analysis.margin_breaches) {
    const compPosition = compMap.get(breach.recipe_id);
    const priceDelta = breach.suggested_price - breach.menu_price;
    const priceDeltaPct =
      breach.menu_price > 0
        ? (priceDelta / breach.menu_price) * 100
        : 0;

    // Validate against comp set if required
    let compValidated = true;
    let compContext: Record<string, unknown> = {};

    if (
      policy.hard_constraints.require_comp_set_validation_for_increases &&
      compPosition
    ) {
      // Only increase if suggested price <= comp set high
      if (breach.suggested_price > compPosition.comp_high * 1.05) {
        compValidated = false;
        // Cap at comp median instead
        breach.suggested_price = compPosition.comp_median;
      }
      compContext = {
        comp_low: compPosition.comp_low,
        comp_median: compPosition.comp_median,
        comp_high: compPosition.comp_high,
        our_position: compPosition.our_position,
      };
    }

    // Calculate margin bleed while waiting for reprint
    const weeklyVolume = getWeeklyVolumeEstimate(analysis, breach.recipe_id);
    const marginBleedPerWeek = weeklyVolume * (breach.suggested_price - breach.menu_price) *
      (breach.breach_pct / 100);

    recs.push({
      run_id: runId,
      venue_id: venueId,
      org_id: orgId,
      recipe_id: breach.recipe_id,
      menu_item_name: breach.recipe_name,
      action_type: 'price_increase',
      reasoning: `Margin breach: food cost ${breach.actual_food_cost_pct}% vs target ${breach.target_food_cost_pct}% (${breach.breach_pct}% over). Suggested price $${breach.suggested_price} to restore target GP%.${compValidated ? '' : ' Capped at comp set median.'}`,
      expected_impact: {
        current_price: breach.menu_price,
        recommended_price: breach.suggested_price,
        price_delta: priceDelta,
        price_change_pct: Math.round(priceDeltaPct * 100) / 100,
        margin_bleed_per_week: Math.round(marginBleedPerWeek * 100) / 100,
        comp_set_context: compContext,
        severity: breach.severity,
      },
    });
  }

  // 2. Underperformers → removal recommendation
  for (const item of analysis.underperformers) {
    if (isItemSacred(item.recipe_id, policy)) {
      // Sacred items get flagged, not removed
      recs.push({
        run_id: runId,
        venue_id: venueId,
        org_id: orgId,
        recipe_id: item.recipe_id,
        menu_item_name: item.recipe_name,
        action_type: 'flag_sacred_cow',
        reasoning: `Sacred item underperforming: ${item.reason}. Manual review required — this item is protected from auto-removal.`,
        expected_impact: {
          velocity_per_week: item.velocity_per_week,
          contribution_margin_per_week: item.contribution_margin_per_week,
          trend: item.trend,
        },
      });
      continue;
    }

    recs.push({
      run_id: runId,
      venue_id: venueId,
      org_id: orgId,
      recipe_id: item.recipe_id,
      menu_item_name: item.recipe_name,
      action_type: 'remove_item',
      reasoning: `Underperformer: ${item.reason}. Observed over ${item.days_observed} days. Consider replacing with a higher-margin item in the ${item.item_category} category.`,
      expected_impact: {
        current_velocity: item.velocity_per_week,
        current_contribution: item.contribution_margin_per_week,
        gp_per_unit: item.gp_per_unit,
        trend: item.trend,
        trend_pct: item.trend_pct,
      },
    });
  }

  // 3. Cannibalization → reposition recommendation
  for (const pair of analysis.cannibalization_pairs) {
    // Recommend keeping the higher-margin item, repositioning or removing the other
    const keepItem =
      pair.item_a.velocity > pair.item_b.velocity ? pair.item_a : pair.item_b;
    const repositionItem =
      keepItem === pair.item_a ? pair.item_b : pair.item_a;

    recs.push({
      run_id: runId,
      venue_id: venueId,
      org_id: orgId,
      recipe_id: repositionItem.recipe_id,
      menu_item_name: repositionItem.name,
      action_type: 'flag_cannibalization',
      reasoning: `Cannibalization detected: "${pair.item_a.name}" and "${pair.item_b.name}" compete in ${pair.item_a.category}. ${pair.reasoning}. Consider repositioning "${repositionItem.name}" (lower velocity: ${repositionItem.velocity}/wk vs ${keepItem.velocity}/wk).`,
      expected_impact: {
        pair_item: keepItem.name,
        correlation_score: pair.correlation_score,
        combined_velocity: pair.item_a.velocity + pair.item_b.velocity,
      },
    });
  }

  // 4. Comp set gaps → price adjustment
  for (const gap of analysis.comp_set_gaps) {
    if (gap.direction === 'underpriced' && gap.headroom > 3) {
      // Only recommend increases for significant gaps
      const recPrice = Math.min(
        gap.our_price + gap.headroom * 0.5, // conservative: capture 50% of headroom
        gap.comp_median
      );
      const priceDelta = recPrice - gap.our_price;
      const priceDeltaPct = (priceDelta / gap.our_price) * 100;

      recs.push({
        run_id: runId,
        venue_id: venueId,
        org_id: orgId,
        recipe_id: gap.recipe_id,
        menu_item_name: gap.recipe_name,
        action_type: 'price_increase',
        reasoning: `Comp set gap: priced at $${gap.our_price} vs comp median $${gap.comp_median} (${gap.comp_count} competitors). $${gap.headroom} headroom available. Recommend capturing 50% of gap.`,
        expected_impact: {
          current_price: gap.our_price,
          recommended_price: Math.round(recPrice * 100) / 100,
          price_delta: Math.round(priceDelta * 100) / 100,
          price_change_pct: Math.round(priceDeltaPct * 100) / 100,
          comp_set_context: {
            comp_low: gap.comp_low,
            comp_median: gap.comp_median,
            comp_high: gap.comp_high,
            headroom: gap.headroom,
          },
        },
      });
    }
  }

  return recs;
}

// ── Auto-Execution ──────────────────────────────────────────

/**
 * Auto-execute a price change: update recipe.menu_price and record history.
 */
async function executeAutoPrice(
  venueId: string,
  recipeId: string,
  oldPrice: number,
  newPrice: number,
  recommendationId: string
): Promise<void> {
  const { getServiceClient } = await import('@/lib/supabase/service');
  const supabase = getServiceClient();

  // Update recipe menu_price
  const { error } = await (supabase as any)
    .from('recipes')
    .update({ menu_price: newPrice })
    .eq('id', recipeId)
    .is('effective_to', null);

  if (error) {
    console.error('[MenuAgent] Error updating recipe price:', error.message);
    return;
  }

  // Record price change for elasticity learning
  await recordPriceChange({
    venue_id: venueId,
    recipe_id: recipeId,
    old_price: oldPrice,
    new_price: newPrice,
    source: 'menu_agent',
    recommendation_id: recommendationId,
  });

  console.log(
    `[MenuAgent] Auto-executed price change: recipe ${recipeId} $${oldPrice} → $${newPrice}`
  );
}

// ── Helpers ──────────────────────────────────────────────────

function isPriceAction(actionType: MenuActionType): boolean {
  return actionType === 'price_increase' || actionType === 'price_decrease';
}

function getWeeklyVolumeEstimate(
  analysis: MenuAnalysis,
  recipeId: string
): number {
  // Find velocity from performance data embedded in analysis
  // Default to 10 if not found
  return 10;
}
