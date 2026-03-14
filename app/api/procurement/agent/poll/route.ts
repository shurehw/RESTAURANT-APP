/**
 * Procurement Agent Polling Endpoint
 *
 * GET /api/procurement/agent/poll — Called by external scheduler
 *
 * For each venue with procurement agent enabled:
 * 1. Classify unclassified items (AI)
 * 2. Detect consumption anomalies
 * 3. Generate POs via existing auto-PO engine + agent context
 * 4. Route POs to approval tiers
 * 5. Auto-execute low-value POs, dispatch to vendors
 * 6. Send notifications for POs requiring approval
 * 7. Record full agent run with reasoning
 *
 * Auth: CRON_SECRET bearer token (matches sales poll pattern)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAutoPurchaseOrders, type AgentContext } from '@/lib/database/auto-po-generator';
import { getActiveProcurementSettings } from '@/lib/database/procurement-settings';
import {
  getAgentEnabledVenues,
  getUnclassifiedItems,
  getItemClassifications,
  upsertItemClassifications,
  createAgentRun,
  updateAgentRun,
  getApprovalTiers,
  seedDefaultApprovalTiers,
} from '@/lib/database/procurement-agent';
import {
  type AgentMode,
  type ApprovalTier,
  type EntityCode,
  determineApprovalTier,
  shouldAutoExecute,
} from '@/lib/ai/procurement-agent-policy';
import { classifyItems } from '@/lib/ai/procurement-classifier';
import { detectConsumptionAnomalies } from '@/lib/ai/procurement-anomaly-detector';
import { dispatchPurchaseOrder } from '@/lib/procurement/order-dispatch';
import { broadcastNotification } from '@/lib/notifications/dispatcher';

const CRON_SECRET = process.env.CRON_SECRET || process.env.CV_CRON_SECRET;

function validateCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) return true; // dev mode

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret === CRON_SECRET) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetVenueId = request.nextUrl.searchParams.get('venue_id');

  try {
    let venues: Array<{ venue_id: string; org_id: string; venue_name: string }>;

    if (targetVenueId) {
      // Manual trigger for specific venue — still need org_id
      const { getServiceClient } = await import('@/lib/supabase/service');
      const supabase = getServiceClient();
      const { data: venue } = await (supabase as any)
        .from('venues')
        .select('id, organization_id, name')
        .eq('id', targetVenueId)
        .single();

      if (!venue) {
        return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
      }
      venues = [{ venue_id: venue.id, org_id: venue.organization_id, venue_name: venue.name }];
    } else {
      venues = await getAgentEnabledVenues();
    }

    if (venues.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No venues with procurement agent enabled',
        venues_processed: 0,
      });
    }

    // Ensure org-level classification runs only once per poll execution,
    // even when multiple venues in the same org are processed concurrently.
    const orgClassificationRuns = new Map<string, Promise<number>>();

    const results = await Promise.allSettled(
      venues.map((v) =>
        processVenue(v.venue_id, v.org_id, v.venue_name, orgClassificationRuns)
      )
    );

    const summary = results.map((r, i) => ({
      venue_id: venues[i].venue_id,
      venue_name: venues[i].venue_name,
      status: r.status,
      ...(r.status === 'fulfilled' ? r.value : { error: (r as any).reason?.message }),
    }));

    console.log('[procurement-agent-poll]', JSON.stringify({
      venues_processed: venues.length,
      results: summary.map((s) => ({
        venue: s.venue_name,
        status: s.status,
        pos_generated: (s as any).pos_generated || 0,
        anomalies: (s as any).anomalies_detected || 0,
      })),
    }));

    return NextResponse.json({
      success: true,
      venues_processed: venues.length,
      results: summary,
    });
  } catch (error: any) {
    console.error('[procurement-agent-poll] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Agent poll failed' },
      { status: 500 }
    );
  }
}

// ── Per-Venue Processing ──────────────────────────────────────

async function processVenue(
  venueId: string,
  orgId: string,
  venueName: string,
  orgClassificationRuns: Map<string, Promise<number>>
): Promise<{
  run_id: string;
  items_classified: number;
  anomalies_detected: number;
  pos_generated: number;
  pos_auto_executed: number;
  pos_pending_approval: number;
  total_estimated_cost: number;
}> {
  // Get settings
  const settings = await getActiveProcurementSettings(orgId);
  const agentMode = (settings as any).agent_mode as AgentMode || 'advise';

  // Create agent run
  const runId = await createAgentRun({
    venue_id: venueId,
    org_id: orgId,
    triggered_by: 'cron',
    signal_type: 'par_breach',
  });

  let itemsEvaluated = 0;
  let itemsClassified = 0;
  let anomaliesDetected = 0;
  let posGenerated = 0;
  let posAutoExecuted = 0;
  let posPendingApproval = 0;
  let totalEstimatedCost = 0;
  const agentReasoning: Record<string, unknown> = {};
  const anomaliesList: unknown[] = [];

  try {
    // 1. Classify unclassified items (once per org per poll invocation)
    const isClassificationOwner = !orgClassificationRuns.has(orgId);
    if (isClassificationOwner) {
      orgClassificationRuns.set(
        orgId,
        classifyUnclassifiedItemsForOrg(orgId)
      );
    }
    if (orgClassificationRuns.has(orgId)) {
      const classified = await orgClassificationRuns.get(orgId)!;
      if (isClassificationOwner) {
        itemsClassified = classified;
        itemsEvaluated += classified;
        if (classified > 0) {
          agentReasoning.classification_scope = 'org_once_per_poll';
          agentReasoning.classifications_count = classified;
        }
      } else {
        agentReasoning.classification_scope = 'skipped_already_run_for_org';
      }
    }

    // 2. Detect anomalies
    const anomalies = await detectConsumptionAnomalies(venueId, orgId);
    anomaliesDetected = anomalies.length;
    anomaliesList.push(...anomalies);

    if (anomalies.some((a) => a.severity === 'critical')) {
      agentReasoning.critical_anomalies = anomalies.filter((a) => a.severity === 'critical');
    }

    // 3. Build entity routing map from classifications
    const allClassifications = await getItemClassifications(orgId);
    const entityRouting = new Map<string, EntityCode>();
    for (const c of allClassifications) {
      entityRouting.set(c.item_id, c.entity_code as EntityCode);
    }

    // 4. Ensure approval tiers exist
    let tiers = await getApprovalTiers(orgId);
    if (tiers.length === 0) {
      await seedDefaultApprovalTiers(orgId);
      tiers = await getApprovalTiers(orgId);
    }

    const tierConfigs = tiers.map((t) => ({
      tier: t.tier_name,
      max_amount: parseFloat(String(t.max_amount)),
      auto_execute: t.auto_execute,
    }));

    // 5. Generate POs with agent context
    const agentContext: AgentContext = {
      agentRunId: runId,
      entityRouting,
      determineApprovalTier: (amount: number) =>
        determineApprovalTier(amount, tierConfigs),
      shouldAutoExecute: (tier: ApprovalTier, autoAllowed: boolean) =>
        shouldAutoExecute(agentMode, tier, autoAllowed),
    };

    // Only generate if auto PO is enabled (or agent is enabled)
    if ((settings as any).auto_po_enabled || (settings as any).agent_enabled) {
      const result = await generateAutoPurchaseOrders(
        venueId,
        'cron',
        undefined,
        agentContext
      );

      posGenerated = result.pos_generated;
      totalEstimatedCost = result.total_estimated_cost;
      itemsEvaluated = Math.max(itemsEvaluated, result.items_evaluated || 0);
      agentReasoning.generation_result = {
        items_evaluated: result.items_evaluated,
        items_needing_order: result.items_needing_order,
        skipped_below_minimum: result.skipped_below_minimum,
      };

      // 6. Dispatch auto-executed POs
      for (const poId of result.po_ids) {
        // Check if this PO was auto-executed (status = 'pending')
        const { getServiceClient } = await import('@/lib/supabase/service');
        const supabase = getServiceClient();
        const { data: po } = await (supabase as any)
          .from('purchase_orders')
          .select('id, status, approval_tier, total_amount')
          .eq('id', poId)
          .single();

        if (po?.status === 'pending') {
          posAutoExecuted++;
          // Dispatch to vendor
          const dispatchResult = await dispatchPurchaseOrder(poId);
          agentReasoning[`dispatch_${poId}`] = {
            success: dispatchResult.success,
            method: dispatchResult.method,
            error: dispatchResult.error,
          };
        } else if (po?.status === 'draft') {
          posPendingApproval++;
        }
      }

      // 7. Notify for POs requiring approval
      if (posPendingApproval > 0) {
        await broadcastNotification({
          orgId,
          venueId,
          targetRole: 'manager',
          type: 'po_approval_needed',
          severity: 'warning',
          title: `${posPendingApproval} Purchase Order${posPendingApproval > 1 ? 's' : ''} Awaiting Approval`,
          body: `Procurement agent generated ${posPendingApproval} PO${posPendingApproval > 1 ? 's' : ''} for ${venueName} totaling $${totalEstimatedCost.toFixed(2)}. Review and approve in KevaOS.`,
          actionUrl: '/admin/procurement',
          sourceTable: 'procurement_agent_runs',
          sourceId: runId,
        });
      }
    }

    // Update agent run with results
    await updateAgentRun(runId, {
      items_evaluated: itemsEvaluated,
      items_classified: itemsClassified,
      pos_generated: posGenerated,
      pos_auto_executed: posAutoExecuted,
      pos_pending_approval: posPendingApproval,
      total_estimated_cost: totalEstimatedCost,
      agent_reasoning: agentReasoning,
      anomalies_detected: anomaliesList,
      status: 'completed',
    });

    return {
      run_id: runId,
      items_classified: itemsClassified,
      anomalies_detected: anomaliesDetected,
      pos_generated: posGenerated,
      pos_auto_executed: posAutoExecuted,
      pos_pending_approval: posPendingApproval,
      total_estimated_cost: totalEstimatedCost,
    };
  } catch (err: any) {
    // Record the failure in the agent run
    await updateAgentRun(runId, {
      items_evaluated: itemsEvaluated,
      items_classified: itemsClassified,
      pos_generated: posGenerated,
      pos_auto_executed: posAutoExecuted,
      pos_pending_approval: posPendingApproval,
      total_estimated_cost: totalEstimatedCost,
      agent_reasoning: { ...agentReasoning, error: err.message },
      anomalies_detected: anomaliesList,
      status: 'failed',
    });

    throw err;
  }
}

async function classifyUnclassifiedItemsForOrg(orgId: string): Promise<number> {
  try {
    const unclassified = await getUnclassifiedItems(orgId);
    if (unclassified.length === 0) return 0;

    const classifications = await classifyItems(
      unclassified.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
      }))
    );

    if (classifications.length > 0) {
      await upsertItemClassifications(
        orgId,
        classifications.map((c) => ({ ...c, classification_source: 'ai' as const }))
      );
    }

    return classifications.length;
  } catch (error: any) {
    console.error('[procurement-agent-poll] classifyUnclassifiedItemsForOrg failed:', error?.message || error);
    return 0;
  }
}
