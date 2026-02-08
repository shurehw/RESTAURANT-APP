/**
 * Operational Standards Database Layer
 *
 * Provides type-safe access to organization-level enforcement standards
 * for comp, labor, and revenue management.
 *
 * ENFORCEMENT PRINCIPLE:
 * Companies calibrate sensitivity, not accountability.
 * OpsOS defines what must be reviewed.
 */

import { getServiceClient } from '@/lib/supabase/service';
import {
  OperationalStandards,
  CompStandards,
  LaborStandards,
  RevenueStandards,
  ApprovedCompReason,
  LABOR_BOUNDS,
  getDefaultLaborStandards,
} from './operational-standards.types';

// ══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ══════════════════════════════════════════════════════════════════════════

/**
 * In-memory cache for operational standards (prevents duplicate Supabase queries).
 * Settings are configuration data that change infrequently - safe to cache.
 */
const standardsCache = new Map<string, { data: OperationalStandards; ts: number }>();
const pendingFetches = new Map<string, Promise<OperationalStandards | null>>();
const STANDARDS_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 100;

/**
 * Invalidate cached standards for an org (call after updates)
 */
function invalidateCache(orgId: string): void {
  standardsCache.delete(orgId);
  pendingFetches.delete(orgId);
}

/**
 * Evict expired/oldest entries when cache is too large
 */
function evictStaleEntries(): void {
  if (standardsCache.size <= MAX_CACHE_SIZE) return;

  const now = Date.now();

  // First try to evict expired entries
  for (const [key, value] of standardsCache) {
    if (now - value.ts > STANDARDS_TTL_MS) {
      standardsCache.delete(key);
    }
  }

  // If still over limit, evict oldest entries (LRU-style)
  if (standardsCache.size > MAX_CACHE_SIZE) {
    const sorted = Array.from(standardsCache.entries())
      .sort((a, b) => a[1].ts - b[1].ts);
    const toDelete = sorted.slice(0, standardsCache.size - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => standardsCache.delete(key));
  }
}

// ══════════════════════════════════════════════════════════════════════════
// DATABASE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get active operational standards for an organization (with in-memory cache)
 */
export async function getActiveOperationalStandards(
  orgId: string
): Promise<OperationalStandards | null> {
  // Check cache first
  const cached = standardsCache.get(orgId);
  if (cached && Date.now() - cached.ts < STANDARDS_TTL_MS) {
    return cached.data;
  }

  // Check if fetch is already in progress (prevent duplicate queries)
  const pending = pendingFetches.get(orgId);
  if (pending) {
    return pending;
  }

  // Start new fetch and track it
  const fetchPromise = fetchStandardsFromDatabase(orgId)
    .then((standards) => {
      if (standards) {
        standardsCache.set(orgId, { data: standards, ts: Date.now() });
        evictStaleEntries();
      }
      pendingFetches.delete(orgId);
      return standards;
    })
    .catch((err) => {
      pendingFetches.delete(orgId);
      throw err;
    });

  pendingFetches.set(orgId, fetchPromise);
  return fetchPromise;
}

/**
 * Internal: Fetch standards from Supabase (bypasses cache)
 */
async function fetchStandardsFromDatabase(
  orgId: string
): Promise<OperationalStandards | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any).rpc('get_active_operational_standards', {
    p_org_id: orgId,
  });

  if (error) {
    console.error('Error fetching active operational standards:', error);
    throw new Error(`Failed to fetch operational standards: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return normalizeOperationalStandards(data[0]);
}

/**
 * Get operational standards as of a specific date (for historical queries)
 */
export async function getOperationalStandardsAt(
  orgId: string,
  asOf: Date = new Date()
): Promise<OperationalStandards | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any).rpc('get_operational_standards_at', {
    p_org_id: orgId,
    p_as_of: asOf.toISOString(),
  });

  if (error) {
    console.error('Error fetching operational standards at date:', error);
    throw new Error(`Failed to fetch operational standards: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return normalizeOperationalStandards(data[0]);
}

/**
 * Get operational standards for a venue (looks up org_id from venue)
 */
export async function getOperationalStandardsForVenue(
  venueId: string
): Promise<OperationalStandards | null> {
  const supabase = getServiceClient();

  // Get org_id from venue
  const { data: venue, error: venueError } = await (supabase as any)
    .from('venues')
    .select('organization_id')
    .eq('id', venueId)
    .single();

  if (venueError || !venue?.organization_id) {
    console.error('Error fetching venue organization:', venueError);
    return null;
  }

  return getActiveOperationalStandards(venue.organization_id);
}

/**
 * Update operational standards (creates new version)
 */
export async function updateOperationalStandards(
  orgId: string,
  updates: Partial<
    Omit<
      CompStandards & LaborStandards & { revenue?: RevenueStandards },
      'org_id' | 'version' | 'effective_from' | 'effective_to'
    >
  >,
  userId?: string
): Promise<{ success: boolean; version?: number; error?: string }> {
  const supabase = getServiceClient();

  try {
    // Get current active standards
    const current = await getActiveOperationalStandards(orgId);

    if (!current) {
      return { success: false, error: 'No active standards found' };
    }

    // Calculate next version
    const nextVersion = current.version + 1;

    // Mark current version as superseded
    await (supabase as any)
      .from('operational_standards')
      .update({
        effective_to: new Date().toISOString(),
        superseded_by_org_id: orgId,
        superseded_by_version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('version', current.version);

    // Build new row
    const newRow: any = {
      org_id: orgId,
      version: nextVersion,
      effective_from: new Date().toISOString(),
      effective_to: null,
      is_active: true,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Comp fields
    if (updates.approved_reasons !== undefined) newRow.comp_approved_reasons = updates.approved_reasons;
    if (updates.high_value_comp_threshold !== undefined) newRow.comp_high_value_threshold = updates.high_value_comp_threshold;
    if (updates.high_comp_pct_threshold !== undefined) newRow.comp_high_pct_threshold = updates.high_comp_pct_threshold;
    if (updates.daily_comp_pct_warning !== undefined) newRow.comp_daily_pct_warning = updates.daily_comp_pct_warning;
    if (updates.daily_comp_pct_critical !== undefined) newRow.comp_daily_pct_critical = updates.daily_comp_pct_critical;
    if (updates.server_max_comp_amount !== undefined) newRow.comp_server_max_amount = updates.server_max_comp_amount;
    if (updates.manager_min_for_high_value !== undefined) newRow.comp_manager_min_high_value = updates.manager_min_for_high_value;
    if (updates.manager_roles !== undefined) newRow.comp_manager_roles = updates.manager_roles;
    if (updates.ai_model !== undefined) newRow.comp_ai_model = updates.ai_model;
    if (updates.ai_max_tokens !== undefined) newRow.comp_ai_max_tokens = updates.ai_max_tokens;
    if (updates.ai_temperature !== undefined) newRow.comp_ai_temperature = updates.ai_temperature;

    // Labor fields
    if (updates.target_labor_pct !== undefined) newRow.labor_target_pct = updates.target_labor_pct;
    if (updates.labor_pct_tolerance !== undefined) newRow.labor_pct_tolerance = updates.labor_pct_tolerance;
    if (updates.splh_floor !== undefined) newRow.labor_splh_floor = updates.splh_floor;
    if (updates.cplh_target !== undefined) newRow.labor_cplh_target = updates.cplh_target;
    if (updates.cplh_tolerance !== undefined) newRow.labor_cplh_tolerance = updates.cplh_tolerance;
    if (updates.ot_warning_threshold !== undefined) newRow.labor_ot_warning_threshold = updates.ot_warning_threshold;
    if (updates.ot_critical_threshold !== undefined) newRow.labor_ot_critical_threshold = updates.ot_critical_threshold;
    if (updates.excluded_roles !== undefined) newRow.labor_excluded_roles = updates.excluded_roles;

    // Insert new version
    const { error: insertError } = await (supabase as any)
      .from('operational_standards')
      .insert(newRow);

    if (insertError) {
      console.error('Error inserting new operational standards version:', insertError);
      return { success: false, error: insertError.message };
    }

    // Invalidate cache so next fetch gets fresh standards
    invalidateCache(orgId);

    return { success: true, version: nextVersion };
  } catch (error: any) {
    console.error('Error updating operational standards:', error);
    return { success: false, error: error.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Normalize database row to OperationalStandards type
 */
function normalizeOperationalStandards(row: any): OperationalStandards {
  return {
    org_id: row.org_id,
    version: row.version,

    // Comp standards
    comp: {
      approved_reasons: Array.isArray(row.comp_approved_reasons)
        ? row.comp_approved_reasons
        : [],
      high_value_comp_threshold: parseFloat(row.comp_high_value_threshold),
      high_comp_pct_threshold: parseFloat(row.comp_high_pct_threshold),
      daily_comp_pct_warning: parseFloat(row.comp_daily_pct_warning),
      daily_comp_pct_critical: parseFloat(row.comp_daily_pct_critical),
      server_max_comp_amount: parseFloat(row.comp_server_max_amount),
      manager_min_for_high_value: parseFloat(row.comp_manager_min_high_value),
      manager_roles: Array.isArray(row.comp_manager_roles)
        ? row.comp_manager_roles
        : [],
      ai_model: row.comp_ai_model,
      ai_max_tokens: row.comp_ai_max_tokens,
      ai_temperature: parseFloat(row.comp_ai_temperature),
    },

    // Labor standards
    labor: {
      target_labor_pct: parseFloat(row.labor_target_pct),
      labor_pct_tolerance: parseFloat(row.labor_pct_tolerance),
      splh_floor: parseFloat(row.labor_splh_floor),
      cplh_target: parseFloat(row.labor_cplh_target),
      cplh_tolerance: parseFloat(row.labor_cplh_tolerance),
      ot_warning_threshold: parseFloat(row.labor_ot_warning_threshold),
      ot_critical_threshold: parseFloat(row.labor_ot_critical_threshold),
      excluded_roles: Array.isArray(row.labor_excluded_roles)
        ? row.labor_excluded_roles
        : [],
    },

    // Metadata
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Get default operational standards (fallback when no org standards exist)
 */
export function getDefaultOperationalStandards(): Omit<
  OperationalStandards,
  'org_id' | 'version' | 'effective_from' | 'effective_to' | 'created_by' | 'created_at' | 'updated_at'
> {
  return {
    comp: {
      approved_reasons: [
        { name: 'Drink Tickets', requires_manager_approval: false, max_amount: null },
        { name: 'Promoter / Customer Development', requires_manager_approval: true, max_amount: null },
        { name: 'Guest Recovery', requires_manager_approval: false, max_amount: 100 },
        { name: 'Black Card', requires_manager_approval: false, max_amount: null },
        { name: 'Staff Discount 10%', requires_manager_approval: false, max_amount: null },
        { name: 'Staff Discount 20%', requires_manager_approval: false, max_amount: null },
        { name: 'Staff Discount 25%', requires_manager_approval: false, max_amount: null },
        { name: 'Staff Discount 30%', requires_manager_approval: false, max_amount: null },
        { name: 'Staff Discount 50%', requires_manager_approval: true, max_amount: null },
        { name: 'Executive/Partner Comps', requires_manager_approval: true, max_amount: null },
        { name: 'Goodwill', requires_manager_approval: false, max_amount: 75 },
        { name: 'DNL (Did Not Like)', requires_manager_approval: false, max_amount: 50 },
        { name: 'Spill / Broken items', requires_manager_approval: false, max_amount: 50 },
        { name: 'FOH Mistake', requires_manager_approval: false, max_amount: 75 },
        { name: 'BOH Mistake / Wrong Temp', requires_manager_approval: false, max_amount: 75 },
        { name: 'Barbuy', requires_manager_approval: true, max_amount: null },
        { name: 'Performer / Band / DJ', requires_manager_approval: true, max_amount: null },
        { name: 'Media / PR / Celebrity', requires_manager_approval: true, max_amount: null },
        { name: 'Manager Meal', requires_manager_approval: false, max_amount: 30 },
      ],
      high_value_comp_threshold: 200,
      high_comp_pct_threshold: 50,
      daily_comp_pct_warning: 2,
      daily_comp_pct_critical: 3,
      server_max_comp_amount: 50,
      manager_min_for_high_value: 200,
      manager_roles: ['Manager', 'General Manager', 'Assistant Manager', 'AGM', 'GM'],
      ai_model: 'claude-sonnet-4-5-20250929',
      ai_max_tokens: 4000,
      ai_temperature: 0.3,
    },
    labor: getDefaultLaborStandards(),
  };
}
