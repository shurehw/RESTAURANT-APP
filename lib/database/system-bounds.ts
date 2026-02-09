/**
 * System Bounds Database Layer
 *
 * Provides type-safe access to Layer 0 (super admin) enforcement boundaries.
 * These are the absolute min/max bounds that all organizations must operate within.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface SystemBounds {
  version: number;

  // Labor Percentage Bounds
  labor_pct_min: number;
  labor_pct_max: number;
  labor_pct_tolerance_min: number;
  labor_pct_tolerance_max: number;
  labor_pct_absolute_escalation: number;

  // SPLH (Sales Per Labor Hour) Bounds
  splh_min: number;
  splh_max: number;
  splh_critical_multiplier: number;

  // CPLH (Covers Per Labor Hour) Bounds
  cplh_min: number;
  cplh_max: number;
  cplh_critical_tolerance: number;

  // Structural Trigger Bounds
  structural_exceptions_7d: number;
  structural_exceptions_14d: number;
  structural_critical_7d: number;

  // Metadata
  effective_from: string;
  effective_to?: string;
}

/**
 * Legacy LABOR_BOUNDS format for backwards compatibility
 */
export interface LaborBounds {
  LABOR_PCT_MIN: number;
  LABOR_PCT_MAX: number;
  LABOR_PCT_ABSOLUTE_ESCALATION: number;
  LABOR_PCT_TOLERANCE_MIN: number;
  LABOR_PCT_TOLERANCE_MAX: number;
  SPLH_MIN: number;
  SPLH_MAX: number;
  SPLH_CRITICAL_MULTIPLIER: number;
  CPLH_MIN: number;
  CPLH_MAX: number;
  CPLH_EXCEPTION_TOLERANCE: number;
  CPLH_CRITICAL_TOLERANCE: number;
  OT_WARNING_PCT: number;
  OT_CRITICAL_PCT: number;
  STRUCTURAL_EXCEPTIONS_7D: number;
  STRUCTURAL_EXCEPTIONS_14D: number;
  STRUCTURAL_CRITICAL_7D: number;
  PEAK_SEVERITY_MULTIPLIER: number;
  CLOSE_STRUCTURAL_COUNT: number;
}

// ══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ══════════════════════════════════════════════════════════════════════════

/**
 * In-memory cache for system bounds (prevents duplicate Supabase queries).
 * System bounds change infrequently (super admin only) - safe to cache.
 */
let systemBoundsCache: { data: SystemBounds; ts: number } | null = null;
let pendingFetch: Promise<SystemBounds> | null = null;
const SYSTEM_BOUNDS_TTL_MS = 30 * 60 * 1000; // 30 minutes (longer than org standards)

/**
 * Invalidate system bounds cache (call after super admin updates)
 */
export function invalidateSystemBoundsCache(): void {
  systemBoundsCache = null;
  pendingFetch = null;
}

// ══════════════════════════════════════════════════════════════════════════
// DATABASE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get active system bounds (Layer 0) with in-memory cache
 */
export async function getActiveSystemBounds(): Promise<SystemBounds> {
  // Check cache first
  if (systemBoundsCache && Date.now() - systemBoundsCache.ts < SYSTEM_BOUNDS_TTL_MS) {
    return systemBoundsCache.data;
  }

  // Check if fetch is already in progress (prevent duplicate queries)
  if (pendingFetch) {
    return pendingFetch;
  }

  // Start new fetch and track it
  pendingFetch = fetchSystemBoundsFromDatabase()
    .then((bounds) => {
      systemBoundsCache = { data: bounds, ts: Date.now() };
      pendingFetch = null;
      return bounds;
    })
    .catch((err) => {
      pendingFetch = null;
      throw err;
    });

  return pendingFetch;
}

/**
 * Internal: Fetch system bounds from Supabase (bypasses cache)
 */
async function fetchSystemBoundsFromDatabase(): Promise<SystemBounds> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any).rpc('get_active_system_bounds');

  if (error) {
    console.error('Error fetching system bounds:', error);
    throw new Error(`Failed to fetch system bounds: ${error.message}`);
  }

  if (!data || data.length === 0) {
    // Fallback to hardcoded defaults if no system bounds found
    console.warn('No system bounds found in database, using hardcoded defaults');
    return getDefaultSystemBounds();
  }

  return normalizeSystemBounds(data[0]);
}

/**
 * Get system bounds in legacy LABOR_BOUNDS format for backwards compatibility
 */
export async function getLaborBounds(): Promise<LaborBounds> {
  const bounds = await getActiveSystemBounds();

  return {
    LABOR_PCT_MIN: bounds.labor_pct_min,
    LABOR_PCT_MAX: bounds.labor_pct_max,
    LABOR_PCT_ABSOLUTE_ESCALATION: bounds.labor_pct_absolute_escalation,
    LABOR_PCT_TOLERANCE_MIN: bounds.labor_pct_tolerance_min,
    LABOR_PCT_TOLERANCE_MAX: bounds.labor_pct_tolerance_max,
    SPLH_MIN: bounds.splh_min,
    SPLH_MAX: bounds.splh_max,
    SPLH_CRITICAL_MULTIPLIER: bounds.splh_critical_multiplier,
    CPLH_MIN: bounds.cplh_min,
    CPLH_MAX: bounds.cplh_max,
    CPLH_EXCEPTION_TOLERANCE: 0.4, // Not in system_bounds table, hardcoded
    CPLH_CRITICAL_TOLERANCE: bounds.cplh_critical_tolerance,
    OT_WARNING_PCT: 8, // Not in system_bounds table, hardcoded
    OT_CRITICAL_PCT: 12, // Not in system_bounds table, hardcoded
    STRUCTURAL_EXCEPTIONS_7D: bounds.structural_exceptions_7d,
    STRUCTURAL_EXCEPTIONS_14D: bounds.structural_exceptions_14d,
    STRUCTURAL_CRITICAL_7D: bounds.structural_critical_7d,
    PEAK_SEVERITY_MULTIPLIER: 1.5, // Not in system_bounds table, hardcoded
    CLOSE_STRUCTURAL_COUNT: 3, // Not in system_bounds table, hardcoded
  };
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Normalize database row to SystemBounds type
 */
function normalizeSystemBounds(row: any): SystemBounds {
  return {
    version: row.version,
    labor_pct_min: parseFloat(row.labor_pct_min),
    labor_pct_max: parseFloat(row.labor_pct_max),
    labor_pct_tolerance_min: parseFloat(row.labor_pct_tolerance_min),
    labor_pct_tolerance_max: parseFloat(row.labor_pct_tolerance_max),
    labor_pct_absolute_escalation: parseFloat(row.labor_pct_absolute_escalation),
    splh_min: parseFloat(row.splh_min),
    splh_max: parseFloat(row.splh_max),
    splh_critical_multiplier: parseFloat(row.splh_critical_multiplier),
    cplh_min: parseFloat(row.cplh_min),
    cplh_max: parseFloat(row.cplh_max),
    cplh_critical_tolerance: parseFloat(row.cplh_critical_tolerance),
    structural_exceptions_7d: row.structural_exceptions_7d,
    structural_exceptions_14d: row.structural_exceptions_14d,
    structural_critical_7d: row.structural_critical_7d,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
  };
}

/**
 * Get default system bounds (fallback when database has no bounds)
 */
function getDefaultSystemBounds(): SystemBounds {
  return {
    version: 1,
    labor_pct_min: 18,
    labor_pct_max: 28,
    labor_pct_tolerance_min: 1.5,
    labor_pct_tolerance_max: 2.0,
    labor_pct_absolute_escalation: 30,
    splh_min: 55,
    splh_max: 120,
    splh_critical_multiplier: 0.85,
    cplh_min: 2.0,
    cplh_max: 6.0,
    cplh_critical_tolerance: 0.8,
    structural_exceptions_7d: 3,
    structural_exceptions_14d: 5,
    structural_critical_7d: 2,
    effective_from: new Date().toISOString(),
  };
}
