// ============================================================================
// Trigger Computation Engine
// Determines which attestation modules/fields are required based on
// nightly report data vs. configurable thresholds.
// ============================================================================

import type {
  AttestationThresholds,
  NightlyReportPayload,
  TriggerResult,
} from './types';

// Default thresholds (used when venue has no custom config)
export const DEFAULT_THRESHOLDS: Omit<AttestationThresholds, 'id' | 'venue_id'> = {
  revenue_variance_pct: 5.0,
  high_comp_amount: 100.0,
  comp_pct_threshold: 3.0,
  labor_variance_pct: 5.0,
  overtime_hours_threshold: 2.0,
  walkout_count_threshold: 1,
};

export function computeTriggers(
  payload: NightlyReportPayload,
  thresholds: Partial<AttestationThresholds> = {},
): TriggerResult {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  const result: TriggerResult = {
    revenue_attestation_required: false,
    revenue_triggers: [],
    comp_resolution_required: false,
    flagged_comps: [],
    labor_attestation_required: false,
    labor_triggers: [],
    incident_log_required: false,
    incident_triggers: [],
  };

  // -----------------------------------------------------------------------
  // Revenue triggers
  // -----------------------------------------------------------------------
  if (payload.forecasted_sales > 0) {
    const variancePct =
      Math.abs(payload.net_sales - payload.forecasted_sales) /
      payload.forecasted_sales * 100;

    if (variancePct >= t.revenue_variance_pct) {
      const direction = payload.net_sales > payload.forecasted_sales ? 'above' : 'below';
      result.revenue_attestation_required = true;
      result.revenue_triggers.push(
        `Revenue ${direction} forecast by ${variancePct.toFixed(1)}% (threshold: ${t.revenue_variance_pct}%)`,
      );
    }
  }

  // Comp % of net sales
  if (payload.net_sales > 0) {
    const compPct = (payload.total_comp_amount / payload.net_sales) * 100;
    if (compPct >= t.comp_pct_threshold) {
      result.revenue_attestation_required = true;
      result.revenue_triggers.push(
        `Comp % of net sales: ${compPct.toFixed(1)}% (threshold: ${t.comp_pct_threshold}%)`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Comp resolution triggers — flag individual comps
  // -----------------------------------------------------------------------
  for (const comp of payload.comps) {
    const triggers: string[] = [];

    if (comp.comp_amount >= t.high_comp_amount) {
      triggers.push(`Comp amount $${comp.comp_amount.toFixed(2)} >= $${t.high_comp_amount} threshold`);
    }

    // High comp % of check (>50% AND >$50 — avoid split-check false positives)
    if (comp.check_amount > 0 && comp.comp_amount > 50) {
      const compPctOfCheck = (comp.comp_amount / comp.check_amount) * 100;
      if (compPctOfCheck > 50) {
        triggers.push(
          `Comp is ${compPctOfCheck.toFixed(0)}% of check total ($${comp.check_amount.toFixed(2)})`,
        );
      }
    }

    // Unknown / blank reason
    if (!comp.comp_reason || comp.comp_reason.trim() === '' || comp.comp_reason.toLowerCase() === 'unknown') {
      triggers.push('Missing or unknown comp reason from POS');
    }

    if (triggers.length > 0) {
      result.comp_resolution_required = true;
      result.flagged_comps.push({
        check_id: comp.check_id,
        check_amount: comp.check_amount,
        comp_amount: comp.comp_amount,
        comp_reason: comp.comp_reason,
        employee_name: comp.employee_name,
        trigger_reasons: triggers,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Labor triggers
  // -----------------------------------------------------------------------
  if (payload.scheduled_labor_cost > 0) {
    const laborVariancePct =
      Math.abs(payload.actual_labor_cost - payload.scheduled_labor_cost) /
      payload.scheduled_labor_cost * 100;

    if (laborVariancePct >= t.labor_variance_pct) {
      const direction = payload.actual_labor_cost > payload.scheduled_labor_cost ? 'over' : 'under';
      result.labor_attestation_required = true;
      result.labor_triggers.push(
        `Labor cost ${direction} schedule by ${laborVariancePct.toFixed(1)}% (threshold: ${t.labor_variance_pct}%)`,
      );
    }
  }

  if (payload.overtime_hours >= t.overtime_hours_threshold) {
    result.labor_attestation_required = true;
    result.labor_triggers.push(
      `${payload.overtime_hours.toFixed(1)} OT hours (threshold: ${t.overtime_hours_threshold}h)`,
    );
  }

  // -----------------------------------------------------------------------
  // Incident triggers
  // -----------------------------------------------------------------------
  if (payload.walkout_count >= t.walkout_count_threshold) {
    result.incident_log_required = true;
    result.incident_triggers.push(
      `${payload.walkout_count} walkout(s) detected (threshold: ${t.walkout_count_threshold})`,
    );
  }

  return result;
}
