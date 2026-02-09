/**
 * Labor Exception Detection
 *
 * Implements OpsOS Labor Efficiency Enforcement Spec (Integrated v1.0)
 *
 * CORE PRINCIPLE:
 * Metrics are NEVER evaluated in isolation.
 * SPLH + CPLH diagnostic matrix determines root cause.
 * Labor % adds severity.
 */

import {
  LaborStandards,
  LaborExceptionSeverity,
  LaborExceptionType,
  LaborDiagnostic,
} from './operational-standards.types';
import type { LaborBounds } from './system-bounds';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface LaborMetrics {
  net_sales: number;
  labor_cost: number;
  labor_hours: number;
  covers: number;
  ot_hours: number;
}

export interface LaborException {
  type: LaborExceptionType;
  severity: LaborExceptionSeverity;
  diagnostic: LaborDiagnostic;
  message: string;
  actual_value: number;
  expected_value: number;
  variance_pct: number;
}

export interface LaborExceptionResult {
  date: string;
  labor_pct: number;
  splh: number;
  cplh: number;
  ot_pct: number;
  diagnostic: LaborDiagnostic;
  exceptions: LaborException[];
  exception_count: number;
  critical_count: number;
  requires_structural_review: boolean;
}

// ══════════════════════════════════════════════════════════════════════════
// EXCEPTION DETECTION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Detect labor exceptions for a single day
 *
 * ENFORCEMENT LOGIC:
 * 1. Calculate all three canonical metrics (Labor %, SPLH, CPLH)
 * 2. Run integrated diagnostic matrix (SPLH + CPLH)
 * 3. Check Layer 0 violations (non-negotiable system bounds)
 * 4. Check Layer 1 violations (org-calibrated standards)
 * 5. Apply severity multipliers
 */
export function detectLaborExceptions(
  metrics: LaborMetrics,
  standards: LaborStandards,
  date: string,
  laborBounds: LaborBounds,
  recentExceptions?: { date: string; critical: boolean }[]
): LaborExceptionResult {
  const exceptions: LaborException[] = [];

  // ── Step 1: Calculate canonical metrics ──

  const laborPct =
    metrics.net_sales > 0 ? (metrics.labor_cost / metrics.net_sales) * 100 : 0;
  const splh = metrics.labor_hours > 0 ? metrics.net_sales / metrics.labor_hours : 0;
  const cplh = metrics.labor_hours > 0 ? metrics.covers / metrics.labor_hours : 0;
  const otPct =
    metrics.labor_hours > 0 ? (metrics.ot_hours / metrics.labor_hours) * 100 : 0;

  // ── Step 2: Run integrated diagnostic matrix ──

  const diagnostic = getDiagnostic(splh, cplh, standards);

  // ── Step 3: Check Layer 1 violations (LOCKED, non-negotiable) ──

  // Labor % > 30% → Absolute escalation
  if (laborPct > laborBounds.LABOR_PCT_ABSOLUTE_ESCALATION) {
    exceptions.push({
      type: LaborExceptionType.LABOR_PCT_CRITICAL,
      severity: LaborExceptionSeverity.CRITICAL,
      diagnostic,
      message: `Labor % (${laborPct.toFixed(1)}%) exceeds absolute limit (${laborBounds.LABOR_PCT_ABSOLUTE_ESCALATION}%)`,
      actual_value: laborPct,
      expected_value: laborBounds.LABOR_PCT_ABSOLUTE_ESCALATION,
      variance_pct: ((laborPct - laborBounds.LABOR_PCT_ABSOLUTE_ESCALATION) / laborBounds.LABOR_PCT_ABSOLUTE_ESCALATION) * 100,
    });
  }

  // SPLH < floor × 0.85 → Critical
  const splhCritical = standards.splh_floor * laborBounds.SPLH_CRITICAL_MULTIPLIER;
  if (splh < splhCritical && splh > 0) {
    exceptions.push({
      type: LaborExceptionType.SPLH_CRITICAL,
      severity: LaborExceptionSeverity.CRITICAL,
      diagnostic,
      message: `SPLH ($${splh.toFixed(0)}) critically below floor ($${splhCritical.toFixed(0)})`,
      actual_value: splh,
      expected_value: splhCritical,
      variance_pct: ((splhCritical - splh) / splhCritical) * 100,
    });
  }

  // CPLH < target - 0.8 → Critical
  const cplhCritical = standards.cplh_target - laborBounds.CPLH_CRITICAL_TOLERANCE;
  if (cplh < cplhCritical && cplh > 0) {
    exceptions.push({
      type: LaborExceptionType.CPLH_CRITICAL,
      severity: LaborExceptionSeverity.CRITICAL,
      diagnostic,
      message: `CPLH (${cplh.toFixed(1)}) critically below target (${cplhCritical.toFixed(1)})`,
      actual_value: cplh,
      expected_value: cplhCritical,
      variance_pct: ((cplhCritical - cplh) / cplhCritical) * 100,
    });
  }

  // ── Step 4: Check Layer 2 violations (org-calibrated) ──

  // Labor % > target + tolerance
  const laborPctThreshold = standards.target_labor_pct + standards.labor_pct_tolerance;
  if (
    laborPct > laborPctThreshold &&
    laborPct <= laborBounds.LABOR_PCT_ABSOLUTE_ESCALATION
  ) {
    exceptions.push({
      type: LaborExceptionType.LABOR_PCT_HIGH,
      severity: LaborExceptionSeverity.WARNING,
      diagnostic,
      message: `Labor % (${laborPct.toFixed(1)}%) exceeds target + tolerance (${laborPctThreshold.toFixed(1)}%)`,
      actual_value: laborPct,
      expected_value: laborPctThreshold,
      variance_pct: ((laborPct - laborPctThreshold) / laborPctThreshold) * 100,
    });
  }

  // SPLH < floor (but not critical)
  if (splh < standards.splh_floor && splh >= splhCritical) {
    exceptions.push({
      type: LaborExceptionType.SPLH_LOW,
      severity: LaborExceptionSeverity.WARNING,
      diagnostic,
      message: `SPLH ($${splh.toFixed(0)}) below floor ($${standards.splh_floor.toFixed(0)})`,
      actual_value: splh,
      expected_value: standards.splh_floor,
      variance_pct: ((standards.splh_floor - splh) / standards.splh_floor) * 100,
    });
  }

  // CPLH < target - tolerance (but not critical)
  const cplhThreshold = standards.cplh_target - standards.cplh_tolerance;
  if (cplh < cplhThreshold && cplh >= cplhCritical) {
    exceptions.push({
      type: LaborExceptionType.CPLH_LOW,
      severity: LaborExceptionSeverity.WARNING,
      diagnostic,
      message: `CPLH (${cplh.toFixed(1)}) below target (${cplhThreshold.toFixed(1)})`,
      actual_value: cplh,
      expected_value: cplhThreshold,
      variance_pct: ((cplhThreshold - cplh) / cplhThreshold) * 100,
    });
  }

  // OT % checks
  if (otPct > standards.ot_critical_threshold) {
    exceptions.push({
      type: LaborExceptionType.OT_CRITICAL,
      severity: LaborExceptionSeverity.CRITICAL,
      diagnostic,
      message: `OT % (${otPct.toFixed(1)}%) exceeds critical threshold (${standards.ot_critical_threshold}%)`,
      actual_value: otPct,
      expected_value: standards.ot_critical_threshold,
      variance_pct: ((otPct - standards.ot_critical_threshold) / standards.ot_critical_threshold) * 100,
    });
  } else if (otPct > standards.ot_warning_threshold) {
    exceptions.push({
      type: LaborExceptionType.OT_HIGH,
      severity: LaborExceptionSeverity.WARNING,
      diagnostic,
      message: `OT % (${otPct.toFixed(1)}%) exceeds warning threshold (${standards.ot_warning_threshold}%)`,
      actual_value: otPct,
      expected_value: standards.ot_warning_threshold,
      variance_pct: ((otPct - standards.ot_warning_threshold) / standards.ot_warning_threshold) * 100,
    });
  }

  // ── Step 5: Check structural triggers ──

  const requiresStructuralReview = checkStructuralTriggers(
    exceptions,
    recentExceptions || []
  );

  if (requiresStructuralReview) {
    exceptions.push({
      type: LaborExceptionType.STRUCTURAL_PATTERN,
      severity: LaborExceptionSeverity.STRUCTURAL,
      diagnostic,
      message: 'Structural pattern detected: repeated labor exceptions require systemic review',
      actual_value: exceptions.length,
      expected_value: 0,
      variance_pct: 100,
    });
  }

  // ── Build result ──

  const criticalCount = exceptions.filter(
    (e) =>
      e.severity === LaborExceptionSeverity.CRITICAL ||
      e.severity === LaborExceptionSeverity.STRUCTURAL
  ).length;

  return {
    date,
    labor_pct: laborPct,
    splh,
    cplh,
    ot_pct: otPct,
    diagnostic,
    exceptions,
    exception_count: exceptions.length,
    critical_count: criticalCount,
    requires_structural_review: requiresStructuralReview,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC MATRIX (Core Innovation)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Integrated Severity Logic: SPLH + CPLH Diagnostic Matrix
 *
 * NEVER evaluate metrics in isolation.
 *
 * | SPLH | CPLH | Interpretation                | Diagnostic               |
 * |------|------|-------------------------------|--------------------------|
 * | ❌    | ❌    | Overstaffed + poor throughput | OVERSTAFFED_SLOW         |
 * | ❌    | ✅    | Overstaffed but busy          | OVERSTAFFED_BUSY         |
 * | ✅    | ❌    | Understaffed / pacing failure | UNDERSTAFFED_OR_PACING   |
 * | ✅    | ✅    | Labor efficient               | EFFICIENT                |
 */
function getDiagnostic(
  splh: number,
  cplh: number,
  standards: LaborStandards
): LaborDiagnostic {
  const splhOk = splh >= standards.splh_floor;
  const cplhOk = cplh >= standards.cplh_target - standards.cplh_tolerance;

  if (!splhOk && !cplhOk) {
    // Both metrics failing → Overstaffed + slow throughput (CRITICAL)
    return LaborDiagnostic.OVERSTAFFED_SLOW;
  }

  if (!splhOk && cplhOk) {
    // SPLH failing but CPLH ok → Overstaffed but busy (staffing level issue)
    return LaborDiagnostic.OVERSTAFFED_BUSY;
  }

  if (splhOk && !cplhOk) {
    // SPLH ok but CPLH failing → Understaffed or pacing issue (deployment)
    return LaborDiagnostic.UNDERSTAFFED_OR_PACING;
  }

  // Both metrics passing → Efficient
  return LaborDiagnostic.EFFICIENT;
}

// ══════════════════════════════════════════════════════════════════════════
// STRUCTURAL TRIGGERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Check if structural review is required
 *
 * LAYER 1 TRIGGERS (non-waivable):
 * - 3 exceptions in 7 days → Structural review
 * - 5 exceptions in 14 days → Structural review
 * - 2 critical exceptions in 7 days → Structural review
 */
function checkStructuralTriggers(
  currentExceptions: LaborException[],
  recentExceptions: { date: string; critical: boolean }[]
): boolean {
  // Current day has critical → add to recent
  const hasCriticalToday = currentExceptions.some(
    (e) =>
      e.severity === LaborExceptionSeverity.CRITICAL ||
      e.severity === LaborExceptionSeverity.STRUCTURAL
  );

  // Count exceptions in last 7 days
  const last7Days = recentExceptions.filter((e) => {
    const daysDiff = daysBetween(e.date, new Date().toISOString().split('T')[0]);
    return daysDiff <= 7;
  });

  const exceptionsIn7Days = last7Days.length + (currentExceptions.length > 0 ? 1 : 0);
  const criticalIn7Days =
    last7Days.filter((e) => e.critical).length + (hasCriticalToday ? 1 : 0);

  // Count exceptions in last 14 days
  const last14Days = recentExceptions.filter((e) => {
    const daysDiff = daysBetween(e.date, new Date().toISOString().split('T')[0]);
    return daysDiff <= 14;
  });

  const exceptionsIn14Days = last14Days.length + (currentExceptions.length > 0 ? 1 : 0);

  // Check triggers
  return (
    exceptionsIn7Days >= laborBounds.STRUCTURAL_EXCEPTIONS_7D ||
    exceptionsIn14Days >= laborBounds.STRUCTURAL_EXCEPTIONS_14D ||
    criticalIn7Days >= laborBounds.STRUCTURAL_CRITICAL_7D
  );
}

/**
 * Helper: Calculate days between two dates
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ══════════════════════════════════════════════════════════════════════════
// INVARIANT VALIDATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Validate that labor standards respect OpsOS bounds (Layer 1)
 *
 * INVARIANT RULES:
 * - Targets are configurable
 * - Bounds are not
 * - Exceptions always fire
 * - Patterns escalate
 * - History is immutable
 */
export function validateLaborStandards(
  standards: LaborStandards,
  laborBounds: LaborBounds
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Labor % bounds
  if (
    standards.target_labor_pct < laborBounds.LABOR_PCT_MIN ||
    standards.target_labor_pct > laborBounds.LABOR_PCT_MAX
  ) {
    errors.push(
      `Labor % target (${standards.target_labor_pct}%) must be between ${laborBounds.LABOR_PCT_MIN}% and ${laborBounds.LABOR_PCT_MAX}%`
    );
  }

  if (
    standards.labor_pct_tolerance < laborBounds.LABOR_PCT_TOLERANCE_MIN ||
    standards.labor_pct_tolerance > laborBounds.LABOR_PCT_TOLERANCE_MAX
  ) {
    errors.push(
      `Labor % tolerance (${standards.labor_pct_tolerance}%) must be between ${laborBounds.LABOR_PCT_TOLERANCE_MIN}% and ${laborBounds.LABOR_PCT_TOLERANCE_MAX}%`
    );
  }

  // SPLH bounds
  if (
    standards.splh_floor < laborBounds.SPLH_MIN ||
    standards.splh_floor > laborBounds.SPLH_MAX
  ) {
    errors.push(
      `SPLH floor ($${standards.splh_floor}) must be between $${laborBounds.SPLH_MIN} and $${laborBounds.SPLH_MAX}`
    );
  }

  // CPLH bounds
  if (
    standards.cplh_target < laborBounds.CPLH_MIN ||
    standards.cplh_target > laborBounds.CPLH_MAX
  ) {
    errors.push(
      `CPLH target (${standards.cplh_target}) must be between ${laborBounds.CPLH_MIN} and ${laborBounds.CPLH_MAX}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
