/**
 * Operational Standards Types
 *
 * ENFORCEMENT PRINCIPLE:
 * Companies calibrate sensitivity, not accountability.
 * OpsOS defines what must be reviewed.
 *
 * Layer 1: Fixed rails (hardcoded, non-negotiable)
 * Layer 2: Company calibration (bounded by OpsOS ranges)
 * Layer 3: Venue targets (derived, not authored)
 */

// ══════════════════════════════════════════════════════════════════════════
// COMP STANDARDS (Existing)
// ══════════════════════════════════════════════════════════════════════════

export interface ApprovedCompReason {
  name: string;
  requires_manager_approval: boolean;
  max_amount: number | null;
}

export interface CompStandards {
  // Policy configuration
  approved_reasons: ApprovedCompReason[];

  // Thresholds (Layer 2: Bounded calibration)
  high_value_comp_threshold: number;       // OpsOS bounds: $100-500
  high_comp_pct_threshold: number;         // OpsOS bounds: 30-70%
  daily_comp_pct_warning: number;          // OpsOS bounds: 1-4%
  daily_comp_pct_critical: number;         // OpsOS bounds: 2-5%

  // Authority levels
  server_max_comp_amount: number;          // OpsOS bounds: $25-100
  manager_min_for_high_value: number;      // OpsOS bounds: $100-500
  manager_roles: string[];

  // AI configuration
  ai_model: string;
  ai_max_tokens: number;
  ai_temperature: number;
}

// ══════════════════════════════════════════════════════════════════════════
// LABOR STANDARDS (NEW - Integrated v1.0)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Labor Efficiency Standards
 *
 * CANONICAL METRICS (INSEPARABLE):
 * - Labor %: Labor $ ÷ Net Sales (cost control)
 * - SPLH: Net Sales ÷ Labor Hours (financial productivity)
 * - CPLH: Covers ÷ Labor Hours (operational throughput)
 *
 * INVARIANT RULES:
 * - Targets are configurable
 * - Bounds are not
 * - Exceptions always fire
 * - Patterns escalate
 * - History is immutable
 */
export interface LaborStandards {
  // ── Labor % Configuration (Primary Cost Guardrail) ──

  /**
   * Target labor percentage
   * OpsOS bounds: 18-28%
   * Layer 1: Absolute escalation >30% (non-negotiable)
   */
  target_labor_pct: number;

  /**
   * Labor % tolerance band
   * OpsOS bounds: ±1.5% to ±2.0%
   * Actual > (target + tolerance) → Exception
   */
  labor_pct_tolerance: number;

  // ── SPLH Configuration (Financial Productivity) ──

  /**
   * Sales Per Labor Hour floor
   * OpsOS bounds: $55-120
   * SPLH < floor → Exception
   * SPLH < (floor × 0.85) → Critical Exception
   */
  splh_floor: number;

  // ── CPLH Configuration (Operational Throughput) ──

  /**
   * Covers Per Labor Hour target
   * OpsOS bounds: 2.0-6.0
   * Default guidance:
   * - Fine dining: 2.0-2.8
   * - Upscale casual: 2.5-3.5
   * - Lounge/club: 3.5-5.0
   * - High-volume bar: 4.0-6.0
   */
  cplh_target: number;

  /**
   * CPLH tolerance
   * CPLH < (target - 0.4) → Exception
   * CPLH < (target - 0.8) → Critical Exception
   */
  cplh_tolerance: number;

  // ── OT Configuration ──

  /**
   * OT hours warning threshold (% of total hours)
   * Default: 8%
   */
  ot_warning_threshold: number;

  /**
   * OT hours critical threshold (% of total hours)
   * Default: 12%
   */
  ot_critical_threshold: number;

  // ── Role Exclusions ──

  /**
   * Roles excluded from labor efficiency calculations
   * e.g., ["Owner", "Executive", "Regional Manager"]
   */
  excluded_roles: string[];

  // ── Time Segment Weighting (Layer 1: Non-waivable) ──
  // Peak inefficiency = 1.5× severity (hardcoded)
  // Close inefficiency repeated 3× → Structural review (hardcoded)
  // Pre-open inefficiency flagged but lower severity (hardcoded)

  // ── Structural Trigger Thresholds (Layer 1: Non-waivable) ──
  // 3 exceptions in 7 days → Structural review (hardcoded)
  // 5 exceptions in 14 days → Structural review (hardcoded)
  // 2 critical exceptions in 7 days → Structural review (hardcoded)
}

/**
 * OpsOS Labor Bounds (Layer 1: LOCKED)
 * These constants enforce non-negotiable limits
 */
export const LABOR_BOUNDS = {
  // Labor %
  LABOR_PCT_MIN: 18,
  LABOR_PCT_MAX: 28,
  LABOR_PCT_ABSOLUTE_ESCALATION: 30,
  LABOR_PCT_TOLERANCE_MIN: 1.5,
  LABOR_PCT_TOLERANCE_MAX: 2.0,

  // SPLH
  SPLH_MIN: 55,
  SPLH_MAX: 120,
  SPLH_CRITICAL_MULTIPLIER: 0.85,

  // CPLH
  CPLH_MIN: 2.0,
  CPLH_MAX: 6.0,
  CPLH_EXCEPTION_TOLERANCE: 0.4,
  CPLH_CRITICAL_TOLERANCE: 0.8,

  // OT
  OT_WARNING_PCT: 8,
  OT_CRITICAL_PCT: 12,

  // Structural triggers
  STRUCTURAL_EXCEPTIONS_7D: 3,
  STRUCTURAL_EXCEPTIONS_14D: 5,
  STRUCTURAL_CRITICAL_7D: 2,

  // Time segment weighting
  PEAK_SEVERITY_MULTIPLIER: 1.5,
  CLOSE_STRUCTURAL_COUNT: 3,
} as const;

/**
 * Labor Exception Severity
 */
export enum LaborExceptionSeverity {
  WARNING = 'warning',
  CRITICAL = 'critical',
  STRUCTURAL = 'structural',
}

/**
 * Labor Exception Type
 */
export enum LaborExceptionType {
  LABOR_PCT_HIGH = 'labor_pct_high',
  LABOR_PCT_CRITICAL = 'labor_pct_critical',
  SPLH_LOW = 'splh_low',
  SPLH_CRITICAL = 'splh_critical',
  CPLH_LOW = 'cplh_low',
  CPLH_CRITICAL = 'cplh_critical',
  OT_HIGH = 'ot_high',
  OT_CRITICAL = 'ot_critical',
  STRUCTURAL_PATTERN = 'structural_pattern',
}

/**
 * Labor Diagnostic Category (Integrated Severity Logic)
 * Based on SPLH + CPLH matrix
 */
export enum LaborDiagnostic {
  /** SPLH ❌ CPLH ❌: Overstaffed + poor throughput → CRITICAL */
  OVERSTAFFED_SLOW = 'overstaffed_slow',

  /** SPLH ❌ CPLH ✅: Overstaffed but busy → Staffing level issue */
  OVERSTAFFED_BUSY = 'overstaffed_busy',

  /** SPLH ✅ CPLH ❌: Understaffed / pacing failure → Deployment issue */
  UNDERSTAFFED_OR_PACING = 'understaffed_or_pacing',

  /** SPLH ✅ CPLH ✅: Labor efficient → No exception */
  EFFICIENT = 'efficient',
}

/**
 * Labor Exception Root Cause (for attestation)
 */
export enum LaborRootCause {
  UNEXPECTED_VOLUME = 'unexpected_volume',
  STAFFING_SHORTAGE = 'staffing_shortage',
  TRAINING_NEW_STAFF = 'training_new_staff',
  SPECIAL_EVENT = 'special_event',
  SLOW_SERVICE_PACE = 'slow_service_pace',
  POOR_SCHEDULING = 'poor_scheduling',
  EXTENDED_OPERATING_HOURS = 'extended_operating_hours',
  EQUIPMENT_ISSUE = 'equipment_issue',
  OTHER = 'other',
}

// ══════════════════════════════════════════════════════════════════════════
// REVENUE STANDARDS (Placeholder - Phase 2)
// ══════════════════════════════════════════════════════════════════════════

export interface RevenueStandards {
  // TODO: Revenue enforcement rails (next phase)
  // - Avg/cover bands
  // - Beverage mix targets
  // - Promo classification
  // - Cover drop thresholds
}

// ══════════════════════════════════════════════════════════════════════════
// UNIFIED OPERATIONAL STANDARDS
// ══════════════════════════════════════════════════════════════════════════

export interface OperationalStandards {
  org_id: string;
  version: number;

  // Standards by domain
  comp: CompStandards;
  labor: LaborStandards;
  revenue?: RevenueStandards;

  // Version metadata
  effective_from: string;
  effective_to: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Default Labor Standards (Layer 2 defaults within Layer 1 bounds)
 */
export function getDefaultLaborStandards(): LaborStandards {
  return {
    // Labor % (midpoint of bounds with moderate tolerance)
    target_labor_pct: 22,
    labor_pct_tolerance: 1.5,

    // SPLH (moderate floor for upscale casual)
    splh_floor: 75,

    // CPLH (upscale casual guidance)
    cplh_target: 3.0,
    cplh_tolerance: 0.4,

    // OT
    ot_warning_threshold: 8,
    ot_critical_threshold: 12,

    // Exclusions
    excluded_roles: ['Owner', 'Executive', 'Regional Manager', 'Corporate'],
  };
}
