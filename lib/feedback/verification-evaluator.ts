/**
 * Verification Evaluator
 *
 * Evaluates resolved feedback objects against their verification specs.
 * Checks whether the expected behavioral outcome actually materialized
 * in subsequent data.
 *
 * Flow:
 *   1. Find resolved feedback_objects with verification_spec and no verified_at
 *   2. Check if verification window has elapsed (resolved_at + window_days)
 *   3. Query actual metric data for the window period
 *   4. Compare against spec (metric, operator, target)
 *   5. Record result (pass/fail/insufficient_data)
 *   6. On fail: create a new escalated successor feedback object
 *
 * "If it's resolved, OpsOS proves it. If a problem repeats, OpsOS escalates."
 */

import { getServiceClient } from '@/lib/supabase/service';
import { createFeedbackObject, type OwnerRole } from './feedback-generator';
import { broadcastNotification } from '@/lib/notifications/dispatcher';

// ── Types ──────────────────────────────────────────────────────

export interface VerificationSpec {
  type: string;
  metric: string;
  operator: '<=' | '>=' | '<' | '>' | '==' | '=';
  target: number;
  window_days: number;
}

interface PendingVerification {
  id: string;
  org_id: string;
  venue_id: string;
  business_date: string;
  domain: string;
  title: string;
  message: string;
  severity: string;
  owner_role: string;
  resolved_at: string;
  verification_spec: VerificationSpec;
}

interface MetricResult {
  measured: number;
  days_with_data: number;
  daily_values: Array<{ date: string; value: number }>;
}

export interface VerificationResult {
  evaluated: number;
  passed: number;
  failed: number;
  insufficient_data: number;
  successors_created: number;
  errors: string[];
}

// ── Escalation Config ──────────────────────────────────────────

const OWNER_ESCALATION: Record<string, OwnerRole> = {
  venue_manager: 'gm',
  gm: 'corporate',
  agm: 'gm',
  corporate: 'corporate', // terminal
};

const SEVERITY_ESCALATION: Record<string, string> = {
  info: 'warning',
  warning: 'critical',
  critical: 'critical', // stays critical
};

// ── Main Entry Point ───────────────────────────────────────────

/**
 * Evaluate all pending verifications.
 * Called from the carry-forward cron.
 */
export async function runVerifications(): Promise<VerificationResult> {
  const supabase = getServiceClient();
  const result: VerificationResult = {
    evaluated: 0,
    passed: 0,
    failed: 0,
    insufficient_data: 0,
    successors_created: 0,
    errors: [],
  };

  // Find resolved feedback objects with verification specs awaiting evaluation
  const { data: pending, error } = await (supabase as any)
    .from('feedback_objects')
    .select(
      'id, org_id, venue_id, business_date, domain, title, message, severity, owner_role, resolved_at, verification_spec'
    )
    .eq('status', 'resolved')
    .not('verification_spec', 'is', null)
    .is('verified_at', null);

  if (error) {
    result.errors.push(`Failed to fetch pending verifications: ${error.message}`);
    return result;
  }

  if (!pending || pending.length === 0) {
    return result;
  }

  const now = Date.now();

  for (const item of pending as PendingVerification[]) {
    try {
      const spec = item.verification_spec;
      if (!spec?.metric || !spec?.operator || spec?.target === undefined || !spec?.window_days) {
        continue; // Malformed spec, skip
      }

      const resolvedAt = new Date(item.resolved_at).getTime();
      const windowEnd = resolvedAt + spec.window_days * 24 * 60 * 60 * 1000;

      // Skip if window hasn't elapsed yet
      if (windowEnd > now) {
        continue;
      }

      result.evaluated++;

      // Compute window date range
      const resolvedDate = new Date(item.resolved_at);
      const windowStartDate = new Date(resolvedDate);
      windowStartDate.setDate(windowStartDate.getDate() + 1); // day after resolution
      const windowEndDate = new Date(resolvedDate);
      windowEndDate.setDate(windowEndDate.getDate() + spec.window_days);

      const windowStart = windowStartDate.toISOString().split('T')[0];
      const windowEndStr = windowEndDate.toISOString().split('T')[0];

      // Fetch metric data
      const metricResult = await fetchMetricData(
        spec.metric,
        item.org_id,
        item.venue_id,
        windowStart,
        windowEndStr
      );

      if (!metricResult || metricResult.days_with_data === 0) {
        // No data available for the window
        await recordVerificationResult(item.id, 'insufficient_data', {
          metric: spec.metric,
          window_start: windowStart,
          window_end: windowEndStr,
          days_with_data: 0,
          reason: 'No data available in verification window',
        });
        await insertOutcome(
          item.id,
          'insufficient_data',
          spec,
          {},
          windowStart,
          windowEndStr,
          0,
          null
        );
        result.insufficient_data++;
        continue;
      }

      // Evaluate: does the measured value satisfy the spec?
      const passes = evaluateOperator(
        metricResult.measured,
        spec.operator,
        spec.target
      );

      const verificationData = {
        metric: spec.metric,
        measured: metricResult.measured,
        target: spec.target,
        operator: spec.operator,
        window_start: windowStart,
        window_end: windowEndStr,
        days_with_data: metricResult.days_with_data,
        daily_values: metricResult.daily_values,
      };

      if (passes) {
        // PASS — behavior changed
        await recordVerificationResult(item.id, 'pass', verificationData);
        await insertOutcome(
          item.id,
          'pass',
          spec,
          verificationData,
          windowStart,
          windowEndStr,
          metricResult.days_with_data,
          null
        );
        result.passed++;
      } else {
        // FAIL — behavior persisted, create escalated successor
        await recordVerificationResult(item.id, 'fail', verificationData);

        const successorId = await createSuccessor(item, spec, metricResult);
        await insertOutcome(
          item.id,
          'fail',
          spec,
          verificationData,
          windowStart,
          windowEndStr,
          metricResult.days_with_data,
          successorId
        );

        if (successorId) {
          result.successors_created++;
        }
        result.failed++;
      }
    } catch (err: any) {
      result.errors.push(
        `Failed to evaluate verification for ${item.id}: ${err.message}`
      );
    }
  }

  return result;
}

// ── Metric Data Fetchers ───────────────────────────────────────

async function fetchMetricData(
  metric: string,
  orgId: string,
  venueId: string,
  windowStart: string,
  windowEnd: string
): Promise<MetricResult | null> {
  switch (metric) {
    case 'daily_comp_pct':
      return fetchCompPctMetric(venueId, windowStart, windowEnd);
    case 'unapproved_comp_count':
      return fetchUnapprovedCompCount(orgId, venueId, windowStart, windowEnd);
    case 'labor_pct':
      return fetchLaborFactMetric(venueId, windowStart, windowEnd, 'labor_pct');
    case 'cplh':
      return fetchLaborFactMetric(
        venueId,
        windowStart,
        windowEnd,
        'covers_per_labor_hour'
      );
    case 'splh':
      return fetchLaborFactMetric(venueId, windowStart, windowEnd, 'splh');
    // Procurement metrics
    case 'cost_spike_count':
      return fetchSignalCount(orgId, venueId, windowStart, windowEnd, 'cost_spike');
    case 'unresolved_invoice_variance_count':
      return fetchUnresolvedInvoiceVarianceCount(venueId, windowStart, windowEnd);
    case 'shrink_cost_total':
      return fetchShrinkCostTotal(venueId, windowStart, windowEnd);
    case 'recipe_drift_count':
      return fetchSignalCount(orgId, venueId, windowStart, windowEnd, 'recipe_cost_drift');
    case 'par_violation_count':
      return fetchParViolationCount(venueId);
    default:
      console.warn(`[Verification] Unknown metric: ${metric}`);
      return null;
  }
}

/**
 * Fetch daily comp % from venue_day_facts for the window period.
 * Returns the average comp % across all days with data.
 */
async function fetchCompPctMetric(
  venueId: string,
  windowStart: string,
  windowEnd: string
): Promise<MetricResult | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('venue_day_facts')
    .select('business_date, comps_total, net_sales')
    .eq('venue_id', venueId)
    .gte('business_date', windowStart)
    .lte('business_date', windowEnd)
    .order('business_date');

  if (error || !data) return null;

  const dailyValues: Array<{ date: string; value: number }> = [];
  let totalPct = 0;

  for (const row of data) {
    const netSales = Number(row.net_sales) || 0;
    const compsTotal = Number(row.comps_total) || 0;
    const pct = netSales > 0 ? (compsTotal / netSales) * 100 : 0;
    dailyValues.push({ date: row.business_date, value: pct });
    totalPct += pct;
  }

  if (dailyValues.length === 0) return null;

  return {
    measured: totalPct / dailyValues.length, // average over window
    days_with_data: dailyValues.length,
    daily_values: dailyValues,
  };
}

/**
 * Count unapproved comp signals in the window from the signals table.
 * Returns the total count (lower is better — target is usually 0).
 */
async function fetchUnapprovedCompCount(
  orgId: string,
  venueId: string,
  windowStart: string,
  windowEnd: string
): Promise<MetricResult | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('signals')
    .select('business_date')
    .eq('org_id', orgId)
    .eq('venue_id', venueId)
    .eq('signal_type', 'comp_unapproved_reason')
    .gte('business_date', windowStart)
    .lte('business_date', windowEnd);

  if (error) return null;

  // Group by date for daily values
  const dateMap = new Map<string, number>();
  for (const row of data || []) {
    const count = dateMap.get(row.business_date) || 0;
    dateMap.set(row.business_date, count + 1);
  }

  const dailyValues = Array.from(dateMap.entries()).map(([date, value]) => ({
    date,
    value,
  }));

  // Total count across the window
  const totalCount = (data || []).length;

  return {
    measured: totalCount,
    days_with_data: dailyValues.length || 1, // at least 1 if we got a response
    daily_values: dailyValues,
  };
}

/**
 * Fetch a labor metric from labor_day_facts for the window.
 * Returns the average value across days with data.
 */
async function fetchLaborFactMetric(
  venueId: string,
  windowStart: string,
  windowEnd: string,
  column: string
): Promise<MetricResult | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('labor_day_facts')
    .select(`business_date, ${column}`)
    .eq('venue_id', venueId)
    .gte('business_date', windowStart)
    .lte('business_date', windowEnd)
    .order('business_date');

  if (error || !data) return null;

  const dailyValues: Array<{ date: string; value: number }> = [];
  let total = 0;

  for (const row of data) {
    const val = Number(row[column]) || 0;
    dailyValues.push({ date: row.business_date, value: val });
    total += val;
  }

  if (dailyValues.length === 0) return null;

  return {
    measured: total / dailyValues.length,
    days_with_data: dailyValues.length,
    daily_values: dailyValues,
  };
}

// ── Procurement Metric Fetchers ────────────────────────────────

/**
 * Count signals of a given type in the verification window.
 * Used for cost_spike_count and recipe_drift_count.
 */
async function fetchSignalCount(
  orgId: string,
  venueId: string,
  windowStart: string,
  windowEnd: string,
  signalType: string
): Promise<MetricResult | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('signals')
    .select('business_date')
    .eq('org_id', orgId)
    .eq('venue_id', venueId)
    .eq('signal_type', signalType)
    .gte('business_date', windowStart)
    .lte('business_date', windowEnd);

  if (error) return null;

  const dateMap = new Map<string, number>();
  for (const row of data || []) {
    const count = dateMap.get(row.business_date) || 0;
    dateMap.set(row.business_date, count + 1);
  }

  const dailyValues = Array.from(dateMap.entries()).map(([date, value]) => ({
    date,
    value,
  }));

  return {
    measured: (data || []).length,
    days_with_data: dailyValues.length || 1,
    daily_values: dailyValues,
  };
}

/**
 * Count unresolved invoice variances created within the window.
 */
async function fetchUnresolvedInvoiceVarianceCount(
  venueId: string,
  windowStart: string,
  windowEnd: string
): Promise<MetricResult | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('invoice_variances')
    .select(`
      id,
      created_at,
      invoices!inner ( venue_id )
    `)
    .eq('invoices.venue_id', venueId)
    .eq('resolved', false)
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd + 'T23:59:59Z');

  if (error) return null;

  return {
    measured: (data || []).length,
    days_with_data: 1,
    daily_values: [{ date: windowEnd, value: (data || []).length }],
  };
}

/**
 * Sum shrink cost from inventory counts within the window.
 * Shrink = (expected - counted) × unit_cost for items where expected > counted.
 */
async function fetchShrinkCostTotal(
  venueId: string,
  windowStart: string,
  windowEnd: string
): Promise<MetricResult | null> {
  const supabase = getServiceClient();

  // Fetch approved counts in window
  const { data: counts, error: countErr } = await (supabase as any)
    .from('inventory_counts')
    .select('id, count_date')
    .eq('venue_id', venueId)
    .eq('status', 'approved')
    .gte('count_date', windowStart)
    .lte('count_date', windowEnd);

  if (countErr || !counts || counts.length === 0) {
    return { measured: 0, days_with_data: 0, daily_values: [] };
  }

  const countIds = counts.map((c: any) => c.id);

  // Fetch count lines
  const { data: lines } = await (supabase as any)
    .from('inventory_count_lines')
    .select('item_id, quantity_counted, unit_cost, count_id')
    .in('count_id', countIds);

  if (!lines || lines.length === 0) {
    return { measured: 0, days_with_data: counts.length, daily_values: [] };
  }

  // Fetch balances for comparison
  const itemIds = [...new Set(lines.map((l: any) => l.item_id))];
  const { data: balances } = await (supabase as any)
    .from('inventory_balances')
    .select('item_id, quantity_on_hand')
    .eq('venue_id', venueId)
    .in('item_id', itemIds);

  const balanceMap = new Map<string, number>();
  for (const b of balances || []) {
    balanceMap.set(b.item_id, Number(b.quantity_on_hand) || 0);
  }

  // Calculate total shrink
  let totalShrink = 0;
  const countDateMap = new Map<string, string>();
  for (const c of counts) {
    countDateMap.set(c.id, c.count_date);
  }

  const dailyMap = new Map<string, number>();
  for (const line of lines) {
    const expected = balanceMap.get(line.item_id) ?? Number(line.quantity_counted);
    const counted = Number(line.quantity_counted) || 0;
    const unitCost = Number(line.unit_cost) || 0;
    const shrink = Math.max(0, (expected - counted) * unitCost);

    if (shrink > 0) {
      totalShrink += shrink;
      const date = countDateMap.get(line.count_id) || windowEnd;
      dailyMap.set(date, (dailyMap.get(date) || 0) + shrink);
    }
  }

  const dailyValues = Array.from(dailyMap.entries()).map(([date, value]) => ({
    date,
    value,
  }));

  return {
    measured: totalShrink,
    days_with_data: counts.length,
    daily_values: dailyValues,
  };
}

/**
 * Count items currently below their reorder point.
 * This is a point-in-time check (not windowed).
 */
async function fetchParViolationCount(
  venueId: string
): Promise<MetricResult | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('items_below_reorder')
    .select('item_id')
    .eq('venue_id', venueId);

  if (error) return null;

  const count = (data || []).length;
  const today = new Date().toISOString().split('T')[0];

  return {
    measured: count,
    days_with_data: 1,
    daily_values: [{ date: today, value: count }],
  };
}

// ── Operator Evaluation ────────────────────────────────────────

function evaluateOperator(
  measured: number,
  operator: string,
  target: number
): boolean {
  switch (operator) {
    case '<=':
      return measured <= target;
    case '>=':
      return measured >= target;
    case '<':
      return measured < target;
    case '>':
      return measured > target;
    case '==':
    case '=':
      return measured === target;
    default:
      return false;
  }
}

// ── Result Recording ───────────────────────────────────────────

async function recordVerificationResult(
  feedbackId: string,
  result: 'pass' | 'fail' | 'insufficient_data',
  data: Record<string, any>
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('feedback_objects')
    .update({
      verified_at: new Date().toISOString(),
      verification_result: result,
      verification_data: data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', feedbackId);

  if (error) {
    throw new Error(
      `Failed to record verification result for ${feedbackId}: ${error.message}`
    );
  }
}

async function insertOutcome(
  feedbackObjectId: string,
  result: string,
  spec: VerificationSpec,
  measuredValues: Record<string, any>,
  windowStart: string,
  windowEnd: string,
  daysWithData: number,
  successorId: string | null
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any).from('feedback_outcomes').insert({
    feedback_object_id: feedbackObjectId,
    result,
    verification_spec: spec,
    measured_values: measuredValues,
    window_start: windowStart,
    window_end: windowEnd,
    days_with_data: daysWithData,
    successor_id: successorId,
  });

  if (error) {
    console.error(
      `[Verification] Failed to insert outcome for ${feedbackObjectId}:`,
      error.message
    );
  }
}

// ── Successor Creation ─────────────────────────────────────────

/**
 * Create a new escalated feedback object when verification fails.
 * The successor inherits the verification spec so it gets checked again.
 */
async function createSuccessor(
  original: PendingVerification,
  spec: VerificationSpec,
  metricResult: MetricResult
): Promise<string | null> {
  try {
    const escalatedSeverity =
      SEVERITY_ESCALATION[original.severity] || 'critical';
    const escalatedOwner =
      OWNER_ESCALATION[original.owner_role as OwnerRole] || 'corporate';

    const measuredStr =
      spec.metric === 'unapproved_comp_count'
        ? `${metricResult.measured} occurrences`
        : `${metricResult.measured.toFixed(1)}%`;

    const successorMessage = `Verification failed for "${original.title}". Expected ${spec.metric} ${spec.operator} ${spec.target} over ${spec.window_days} days, but measured ${measuredStr}. This issue has persisted despite previous resolution.`;

    const successor = await createFeedbackObject({
      orgId: original.org_id,
      venueId: original.venue_id,
      businessDate: new Date().toISOString().split('T')[0],
      domain: original.domain as any,
      title: `Recurring: ${original.title}`,
      message: successorMessage,
      severity: escalatedSeverity as any,
      requiredAction: 'resolve',
      ownerRole: escalatedOwner,
      dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h deadline
      verificationSpec: spec, // Same spec — will be checked again
      sourceRunId: original.id, // Link to original
    });

    // Notify the escalated owner about the recurring issue
    try {
      await broadcastNotification({
        orgId: original.org_id,
        venueId: original.venue_id,
        targetRole: escalatedOwner as string,
        type: 'verification_failed',
        severity: 'critical',
        title: `Recurring Issue: ${original.title}`,
        body: successorMessage,
        actionUrl: '/preshift',
        sourceTable: 'feedback_object',
        sourceId: successor.id,
      });
    } catch (notifyErr: any) {
      console.error(`[Verification] Notification failed for successor ${successor.id}:`, notifyErr.message);
    }

    return successor.id;
  } catch (err: any) {
    console.error(
      `[Verification] Failed to create successor for ${original.id}:`,
      err.message
    );
    return null;
  }
}
