/**
 * Comp Settings Database Layer
 * Provides type-safe access to organization-level comp policy settings
 */

import { getServiceClient } from '@/lib/supabase/service';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface ApprovedCompReason {
  name: string;
  requires_manager_approval: boolean;
  max_amount: number | null;
}

export interface CompSettings {
  org_id: string;
  version: number;

  // Policy configuration
  approved_reasons: ApprovedCompReason[];

  // Thresholds
  high_value_comp_threshold: number;
  high_comp_pct_threshold: number;
  daily_comp_pct_warning: number;
  daily_comp_pct_critical: number;

  // Authority levels
  server_max_comp_amount: number;
  manager_min_for_high_value: number;
  manager_roles: string[];

  // AI configuration
  ai_model: string;
  ai_max_tokens: number;
  ai_temperature: number;

  // Version metadata
  effective_from?: string;
  effective_to?: string | null;
}

// ══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ══════════════════════════════════════════════════════════════════════════

/**
 * In-memory cache for comp settings (prevents duplicate Supabase queries).
 * Settings are configuration data that change infrequently - safe to cache.
 */
const settingsCache = new Map<string, { data: CompSettings; ts: number }>();
const pendingFetches = new Map<string, Promise<CompSettings | null>>();
const SETTINGS_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 100;

/**
 * Invalidate cached settings for an org (call after updates)
 */
function invalidateCache(orgId: string): void {
  settingsCache.delete(orgId);
  pendingFetches.delete(orgId);
}

/**
 * Evict expired/oldest entries when cache is too large
 */
function evictStaleEntries(): void {
  if (settingsCache.size <= MAX_CACHE_SIZE) return;

  const now = Date.now();

  // First try to evict expired entries
  for (const [key, value] of settingsCache) {
    if (now - value.ts > SETTINGS_TTL_MS) {
      settingsCache.delete(key);
    }
  }

  // If still over limit, evict oldest entries (LRU-style)
  if (settingsCache.size > MAX_CACHE_SIZE) {
    const sorted = Array.from(settingsCache.entries())
      .sort((a, b) => a[1].ts - b[1].ts);
    const toDelete = sorted.slice(0, settingsCache.size - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => settingsCache.delete(key));
  }
}

// ══════════════════════════════════════════════════════════════════════════
// DATABASE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get active comp settings for an organization (with in-memory cache)
 */
export async function getActiveCompSettings(
  orgId: string
): Promise<CompSettings | null> {
  // Check cache first
  const cached = settingsCache.get(orgId);
  if (cached && Date.now() - cached.ts < SETTINGS_TTL_MS) {
    return cached.data;
  }

  // Check if fetch is already in progress (prevent duplicate queries)
  const pending = pendingFetches.get(orgId);
  if (pending) {
    return pending;
  }

  // Start new fetch and track it
  const fetchPromise = fetchSettingsFromDatabase(orgId)
    .then((settings) => {
      if (settings) {
        settingsCache.set(orgId, { data: settings, ts: Date.now() });
        evictStaleEntries();
      }
      pendingFetches.delete(orgId);
      return settings;
    })
    .catch((err) => {
      pendingFetches.delete(orgId);
      throw err;
    });

  pendingFetches.set(orgId, fetchPromise);
  return fetchPromise;
}

/**
 * Internal: Fetch settings from Supabase (bypasses cache)
 */
async function fetchSettingsFromDatabase(
  orgId: string
): Promise<CompSettings | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any).rpc('get_active_comp_settings', {
    p_org_id: orgId,
  });

  if (error) {
    console.error('Error fetching active comp settings:', error);
    throw new Error(`Failed to fetch comp settings: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return normalizeCompSettings(data[0]);
}

/**
 * Get comp settings as of a specific date (for historical queries)
 */
export async function getCompSettingsAt(
  orgId: string,
  asOf: Date = new Date()
): Promise<CompSettings | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any).rpc('get_comp_settings_at', {
    p_org_id: orgId,
    p_as_of: asOf.toISOString(),
  });

  if (error) {
    console.error('Error fetching comp settings at date:', error);
    throw new Error(`Failed to fetch comp settings: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return normalizeCompSettings(data[0]);
}

/**
 * Get comp settings for a venue (looks up org_id from venue)
 */
export async function getCompSettingsForVenue(
  venueId: string
): Promise<CompSettings | null> {
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

  return getActiveCompSettings(venue.organization_id);
}

/**
 * Update comp settings (creates new version)
 */
export async function updateCompSettings(
  orgId: string,
  updates: Partial<Omit<CompSettings, 'org_id' | 'version' | 'effective_from' | 'effective_to'>>,
  userId?: string
): Promise<{ success: boolean; version?: number; error?: string }> {
  const supabase = getServiceClient();

  try {
    // Get current active settings
    const current = await getActiveCompSettings(orgId);

    if (!current) {
      return { success: false, error: 'No active settings found' };
    }

    // Calculate next version
    const nextVersion = current.version + 1;

    // Mark current version as superseded
    await (supabase as any)
      .from('comp_settings')
      .update({
        effective_to: new Date().toISOString(),
        superseded_by_org_id: orgId,
        superseded_by_version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('version', current.version);

    // Insert new version
    const { error: insertError } = await (supabase as any)
      .from('comp_settings')
      .insert({
        org_id: orgId,
        version: nextVersion,
        approved_reasons: updates.approved_reasons ?? current.approved_reasons,
        high_value_comp_threshold: updates.high_value_comp_threshold ?? current.high_value_comp_threshold,
        high_comp_pct_threshold: updates.high_comp_pct_threshold ?? current.high_comp_pct_threshold,
        daily_comp_pct_warning: updates.daily_comp_pct_warning ?? current.daily_comp_pct_warning,
        daily_comp_pct_critical: updates.daily_comp_pct_critical ?? current.daily_comp_pct_critical,
        server_max_comp_amount: updates.server_max_comp_amount ?? current.server_max_comp_amount,
        manager_min_for_high_value: updates.manager_min_for_high_value ?? current.manager_min_for_high_value,
        manager_roles: updates.manager_roles ?? current.manager_roles,
        ai_model: updates.ai_model ?? current.ai_model,
        ai_max_tokens: updates.ai_max_tokens ?? current.ai_max_tokens,
        ai_temperature: updates.ai_temperature ?? current.ai_temperature,
        effective_from: new Date().toISOString(),
        effective_to: null,
        is_active: true,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error inserting new comp settings version:', insertError);
      return { success: false, error: insertError.message };
    }

    // Invalidate cache so next fetch gets fresh settings
    invalidateCache(orgId);

    return { success: true, version: nextVersion };
  } catch (error: any) {
    console.error('Error updating comp settings:', error);
    return { success: false, error: error.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Normalize database row to CompSettings type
 */
function normalizeCompSettings(row: any): CompSettings {
  return {
    org_id: row.org_id,
    version: row.version,
    approved_reasons: Array.isArray(row.approved_reasons)
      ? row.approved_reasons
      : [],
    high_value_comp_threshold: parseFloat(row.high_value_comp_threshold),
    high_comp_pct_threshold: parseFloat(row.high_comp_pct_threshold),
    daily_comp_pct_warning: parseFloat(row.daily_comp_pct_warning),
    daily_comp_pct_critical: parseFloat(row.daily_comp_pct_critical),
    server_max_comp_amount: parseFloat(row.server_max_comp_amount),
    manager_min_for_high_value: parseFloat(row.manager_min_for_high_value),
    manager_roles: Array.isArray(row.manager_roles)
      ? row.manager_roles
      : [],
    ai_model: row.ai_model,
    ai_max_tokens: row.ai_max_tokens,
    ai_temperature: parseFloat(row.ai_temperature),
    effective_from: row.effective_from,
    effective_to: row.effective_to,
  };
}

/**
 * Get default comp settings (fallback when no org settings exist)
 */
export function getDefaultCompSettings(): Omit<CompSettings, 'org_id' | 'version' | 'effective_from' | 'effective_to'> {
  return {
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
  };
}
