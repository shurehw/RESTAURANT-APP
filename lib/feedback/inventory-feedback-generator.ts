/**
 * Inventory Feedback Generator
 *
 * Creates feedback objects from inventory/procurement exception signals.
 * Follows the exact pattern of generateCompFeedback() in feedback-generator.ts.
 *
 * Each exception type maps to a signal type, severity, owner, and
 * verification spec so the enforcement loop can later prove improvement.
 */

import { createFeedbackObject, type FeedbackObject } from './feedback-generator';
import type {
  CostSpikeException,
  InvoiceVarianceException,
  InventoryShrinkException,
  RecipeCostDriftException,
  ParLevelViolationException,
  PROCUREMENT_DEFAULTS,
} from '@/lib/database/inventory-exceptions';

// ── Cost Spike Feedback ─────────────────────────────────────────

/**
 * Create feedback objects for cost spikes.
 * Groups spikes by vendor — one feedback object per vendor.
 */
export async function generateCostSpikeFeedback(params: {
  orgId: string;
  venueId: string;
  businessDate: string;
  exceptions: CostSpikeException[];
  signalIds: string[];
}): Promise<FeedbackObject[]> {
  if (params.exceptions.length === 0) return [];

  // Group by vendor
  const byVendor = new Map<string, CostSpikeException[]>();
  for (const ex of params.exceptions) {
    const key = ex.vendor_id || 'unknown';
    const list = byVendor.get(key) || [];
    list.push(ex);
    byVendor.set(key, list);
  }

  const results: FeedbackObject[] = [];
  let signalIdx = 0;

  for (const [vendorKey, spikes] of byVendor) {
    const vendorName = spikes[0].vendor_name || 'Unknown Vendor';
    const maxZ = Math.max(...spikes.map(s => Math.abs(s.z_score)));
    const severity = maxZ > 3 ? 'critical' : 'warning';
    const totalImpact = spikes.reduce((sum, s) => sum + Math.abs(s.new_cost - s.avg_cost), 0);

    const itemList = spikes
      .slice(0, 5)
      .map(s => `${s.item_name}: $${s.new_cost.toFixed(2)} (avg $${s.avg_cost.toFixed(2)}, +${s.variance_pct.toFixed(0)}%)`)
      .join('; ');

    const signalsForVendor = params.signalIds.slice(signalIdx, signalIdx + spikes.length);
    signalIdx += spikes.length;

    results.push(await createFeedbackObject({
      orgId: params.orgId,
      venueId: params.venueId,
      businessDate: params.businessDate,
      domain: 'procurement',
      title: `${spikes.length} Cost Spike${spikes.length > 1 ? 's' : ''} — ${vendorName}`,
      message: `Detected ${spikes.length} item${spikes.length > 1 ? 's' : ''} with abnormal pricing from ${vendorName} (max z-score: ${maxZ.toFixed(1)}). Items: ${itemList}${spikes.length > 5 ? ` and ${spikes.length - 5} more` : ''}.`,
      severity: severity as any,
      requiredAction: 'explain',
      ownerRole: 'purchasing',
      dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      signalIds: signalsForVendor,
      verificationSpec: {
        type: 'procurement_cost',
        metric: 'cost_spike_count',
        operator: '<=',
        target: 0,
        window_days: 14,
      },
    }));
  }

  return results;
}

// ── Invoice Variance Feedback ───────────────────────────────────

/**
 * Create feedback objects for unresolved invoice variances.
 * Groups by variance type — one feedback per type.
 */
export async function generateInvoiceVarianceFeedback(params: {
  orgId: string;
  venueId: string;
  businessDate: string;
  exceptions: InvoiceVarianceException[];
  signalIds: string[];
}): Promise<FeedbackObject[]> {
  if (params.exceptions.length === 0) return [];

  // Group by variance_type
  const byType = new Map<string, InvoiceVarianceException[]>();
  for (const ex of params.exceptions) {
    const list = byType.get(ex.variance_type) || [];
    list.push(ex);
    byType.set(ex.variance_type, list);
  }

  const results: FeedbackObject[] = [];
  let signalIdx = 0;

  const typeLabels: Record<string, string> = {
    price: 'Price Variances',
    quantity: 'Quantity Variances',
    unmapped: 'Unmapped Items',
    no_po: 'Invoices Without PO',
  };

  for (const [varType, exceptions] of byType) {
    const totalVariance = exceptions.reduce((sum, e) => sum + Math.abs(e.total_variance_amount), 0);
    const hasCritical = exceptions.some(e => e.severity === 'critical');
    const severity = hasCritical || totalVariance > 1000 ? 'critical' : 'warning';
    const label = typeLabels[varType] || varType;

    const vendorList = [...new Set(exceptions.map(e => e.vendor_name))].slice(0, 3).join(', ');

    const signalsForType = params.signalIds.slice(signalIdx, signalIdx + exceptions.length);
    signalIdx += exceptions.length;

    results.push(await createFeedbackObject({
      orgId: params.orgId,
      venueId: params.venueId,
      businessDate: params.businessDate,
      domain: 'procurement',
      title: `${exceptions.length} ${label}`,
      message: `${exceptions.length} unresolved invoice ${varType} variance${exceptions.length > 1 ? 's' : ''} totaling $${totalVariance.toFixed(2)}. Vendors: ${vendorList}. Review and resolve before end of business.`,
      severity: severity as any,
      requiredAction: 'resolve',
      ownerRole: varType === 'no_po' ? 'venue_manager' : 'purchasing',
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      signalIds: signalsForType,
      verificationSpec: {
        type: 'procurement_invoices',
        metric: 'unresolved_invoice_variance_count',
        operator: '<=',
        target: 0,
        window_days: 7,
      },
    }));
  }

  return results;
}

// ── Inventory Shrink Feedback ───────────────────────────────────

/**
 * Create feedback objects for high inventory shrink.
 * One feedback per count session with high shrink.
 */
export async function generateShrinkFeedback(params: {
  orgId: string;
  venueId: string;
  businessDate: string;
  exceptions: InventoryShrinkException[];
  signalIds: string[];
}): Promise<FeedbackObject[]> {
  if (params.exceptions.length === 0) return [];

  const results: FeedbackObject[] = [];

  for (let i = 0; i < params.exceptions.length; i++) {
    const ex = params.exceptions[i];
    const severity = ex.total_shrink_cost >= 2000 ? 'critical' : 'warning';

    const topItems = ex.high_shrink_items
      .slice(0, 5)
      .map(item => `${item.item_name}: -${(item.expected_qty - item.counted_qty).toFixed(1)} units ($${item.shrink_cost.toFixed(2)})`)
      .join('; ');

    results.push(await createFeedbackObject({
      orgId: params.orgId,
      venueId: params.venueId,
      businessDate: params.businessDate,
      domain: 'procurement',
      title: `Inventory Shrink: $${ex.total_shrink_cost.toFixed(0)} (${ex.shrink_pct.toFixed(1)}%)`,
      message: `Physical count on ${ex.count_date} found $${ex.total_shrink_cost.toFixed(2)} in shrink (${ex.shrink_pct.toFixed(1)}% of counted value) across ${ex.high_shrink_items.length} items. Top items: ${topItems}${ex.high_shrink_items.length > 5 ? ` and ${ex.high_shrink_items.length - 5} more` : ''}.`,
      severity: severity as any,
      requiredAction: 'explain',
      ownerRole: 'venue_manager',
      dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      signalIds: params.signalIds[i] ? [params.signalIds[i]] : [],
      verificationSpec: {
        type: 'procurement_shrink',
        metric: 'shrink_cost_total',
        operator: '<=',
        target: 500,
        window_days: 30,
      },
    }));
  }

  return results;
}

// ── Recipe Cost Drift Feedback ──────────────────────────────────

/**
 * Create feedback objects for recipes with significant cost drift.
 * One feedback per recipe.
 */
export async function generateRecipeDriftFeedback(params: {
  orgId: string;
  venueId: string;
  businessDate: string;
  exceptions: RecipeCostDriftException[];
  signalIds: string[];
}): Promise<FeedbackObject[]> {
  if (params.exceptions.length === 0) return [];

  const results: FeedbackObject[] = [];

  for (let i = 0; i < params.exceptions.length; i++) {
    const ex = params.exceptions[i];
    const severity = Math.abs(ex.drift_pct) >= 20 ? 'critical' : 'warning';
    const direction = ex.drift_pct > 0 ? 'increased' : 'decreased';

    results.push(await createFeedbackObject({
      orgId: params.orgId,
      venueId: params.venueId,
      businessDate: params.businessDate,
      domain: 'procurement',
      title: `Recipe Cost ${direction === 'increased' ? 'Up' : 'Down'}: ${ex.recipe_name} (${ex.drift_pct > 0 ? '+' : ''}${ex.drift_pct.toFixed(1)}%)`,
      message: `Recipe "${ex.recipe_name}" cost ${direction} from $${ex.previous_cost.toFixed(2)} to $${ex.current_cost.toFixed(2)} (${ex.drift_pct > 0 ? '+' : ''}${ex.drift_pct.toFixed(1)}%). Review ingredient costs and consider menu price adjustment.`,
      severity: severity as any,
      requiredAction: 'acknowledge',
      ownerRole: 'venue_manager',
      dueAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      signalIds: params.signalIds[i] ? [params.signalIds[i]] : [],
      verificationSpec: {
        type: 'procurement_recipe',
        metric: 'recipe_drift_count',
        operator: '<=',
        target: 0,
        window_days: 14,
      },
    }));
  }

  return results;
}

// ── Par Level Violation Feedback ────────────────────────────────

/**
 * Create one aggregate feedback object for all par level violations.
 */
export async function generateParViolationFeedback(params: {
  orgId: string;
  venueId: string;
  businessDate: string;
  exceptions: ParLevelViolationException[];
  signalIds: string[];
}): Promise<FeedbackObject[]> {
  if (params.exceptions.length === 0) return [];

  const count = params.exceptions.length;
  const severity = count > 10 ? 'critical' : count > 5 ? 'warning' : 'info';
  const totalCost = params.exceptions.reduce((sum, e) => sum + e.estimated_order_cost, 0);

  const itemList = params.exceptions
    .slice(0, 5)
    .map(e => `${e.item_name}: ${e.quantity_on_hand.toFixed(0)}/${e.reorder_point.toFixed(0)}`)
    .join('; ');

  // Only create feedback for warning+ severity
  if (severity === 'info') return [];

  return [await createFeedbackObject({
    orgId: params.orgId,
    venueId: params.venueId,
    businessDate: params.businessDate,
    domain: 'procurement',
    title: `${count} Items Below Par`,
    message: `${count} item${count > 1 ? 's are' : ' is'} below reorder point (est. reorder cost: $${totalCost.toFixed(2)}). Items: ${itemList}${count > 5 ? ` and ${count - 5} more` : ''}. Place orders to restore par levels.`,
    severity: severity as any,
    requiredAction: 'correct',
    ownerRole: 'purchasing',
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    signalIds: params.signalIds,
    verificationSpec: {
      type: 'procurement_par',
      metric: 'par_violation_count',
      operator: '<=',
      target: 0,
      window_days: 7,
    },
  })];
}
