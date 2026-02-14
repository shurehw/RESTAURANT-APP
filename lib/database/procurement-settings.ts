/**
 * Procurement Settings Database Layer
 *
 * Type-safe access to org-level procurement thresholds and
 * per-user purchasing authorizations. Follows comp-settings.ts pattern.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface ProcurementSettings {
  org_id: string;
  version: number;

  // Cost spike detection
  cost_spike_z_threshold: number;
  cost_spike_lookback_days: number;
  cost_spike_min_history: number;

  // Inventory shrink
  shrink_cost_warning: number;
  shrink_cost_critical: number;

  // Recipe cost drift
  recipe_drift_warning_pct: number;
  recipe_drift_critical_pct: number;
  recipe_drift_lookback_days: number;

  // Purchasing rules
  require_purchasing_authorization: boolean;

  // Version metadata
  effective_from?: string;
  effective_to?: string | null;
}

export interface PurchasingAuthorization {
  id: string;
  org_id: string;
  user_id: string;
  venue_id: string | null;
  authorized_item_ids: string[];
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthorizationCheckResult {
  authorized: boolean;
  unauthorizedItemIds: string[];
  unauthorizedItemNames: string[];
}

// ── In-Memory Cache ──────────────────────────────────────────

const settingsCache = new Map<string, { data: ProcurementSettings; ts: number }>();
const pendingFetches = new Map<string, Promise<ProcurementSettings>>();
const SETTINGS_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 100;

function invalidateCache(orgId: string): void {
  settingsCache.delete(orgId);
  pendingFetches.delete(orgId);
}

function evictStaleEntries(): void {
  if (settingsCache.size <= MAX_CACHE_SIZE) return;

  const now = Date.now();
  for (const [key, value] of settingsCache) {
    if (now - value.ts > SETTINGS_TTL_MS) {
      settingsCache.delete(key);
    }
  }

  if (settingsCache.size > MAX_CACHE_SIZE) {
    const sorted = Array.from(settingsCache.entries())
      .sort((a, b) => a[1].ts - b[1].ts);
    const toDelete = sorted.slice(0, settingsCache.size - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => settingsCache.delete(key));
  }
}

// ── Default Settings ───────────────────────────────────────────

export function getDefaultProcurementSettings(): Omit<ProcurementSettings, 'org_id' | 'version' | 'effective_from' | 'effective_to'> {
  return {
    cost_spike_z_threshold: 2.0,
    cost_spike_lookback_days: 90,
    cost_spike_min_history: 5,
    shrink_cost_warning: 500,
    shrink_cost_critical: 2000,
    recipe_drift_warning_pct: 10,
    recipe_drift_critical_pct: 20,
    recipe_drift_lookback_days: 30,
    require_purchasing_authorization: false,
  };
}

// ── Settings CRUD ──────────────────────────────────────────────

/**
 * Get active procurement settings for an org (with cache).
 * Falls back to defaults if no settings exist.
 */
export async function getActiveProcurementSettings(
  orgId: string
): Promise<ProcurementSettings> {
  // Check cache
  const cached = settingsCache.get(orgId);
  if (cached && Date.now() - cached.ts < SETTINGS_TTL_MS) {
    return cached.data;
  }

  // Dedup in-flight fetches
  const pending = pendingFetches.get(orgId);
  if (pending) return pending;

  const fetchPromise = fetchSettingsFromDatabase(orgId)
    .then((settings) => {
      settingsCache.set(orgId, { data: settings, ts: Date.now() });
      evictStaleEntries();
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

async function fetchSettingsFromDatabase(orgId: string): Promise<ProcurementSettings> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any).rpc('get_active_procurement_settings', {
    p_org_id: orgId,
  });

  if (error) {
    console.error('[ProcurementSettings] Error fetching:', error.message);
    // Fall back to defaults on error
    const defaults = getDefaultProcurementSettings();
    return { org_id: orgId, version: 0, ...defaults };
  }

  if (!data || data.length === 0) {
    // No settings configured — return defaults
    const defaults = getDefaultProcurementSettings();
    return { org_id: orgId, version: 0, ...defaults };
  }

  return normalizeProcurementSettings(data[0]);
}

/**
 * Get procurement settings for a venue (resolves org_id).
 */
export async function getProcurementSettingsForVenue(
  venueId: string
): Promise<ProcurementSettings> {
  const supabase = getServiceClient();

  const { data: venue } = await (supabase as any)
    .from('venues')
    .select('organization_id')
    .eq('id', venueId)
    .single();

  if (!venue?.organization_id) {
    const defaults = getDefaultProcurementSettings();
    return { org_id: '', version: 0, ...defaults };
  }

  return getActiveProcurementSettings(venue.organization_id);
}

/**
 * Update procurement settings (creates new version).
 */
export async function updateProcurementSettings(
  orgId: string,
  updates: Partial<Omit<ProcurementSettings, 'org_id' | 'version' | 'effective_from' | 'effective_to'>>,
  userId?: string
): Promise<{ success: boolean; version?: number; error?: string }> {
  const supabase = getServiceClient();

  try {
    const current = await getActiveProcurementSettings(orgId);
    const nextVersion = current.version + 1;

    // Supersede current version (if it exists in DB)
    if (current.version > 0) {
      await (supabase as any)
        .from('procurement_settings')
        .update({
          effective_to: new Date().toISOString(),
          superseded_by_version: nextVersion,
          updated_at: new Date().toISOString(),
        })
        .eq('org_id', orgId)
        .eq('version', current.version);
    }

    // Insert new version
    const { error: insertError } = await (supabase as any)
      .from('procurement_settings')
      .insert({
        org_id: orgId,
        version: nextVersion,
        cost_spike_z_threshold: updates.cost_spike_z_threshold ?? current.cost_spike_z_threshold,
        cost_spike_lookback_days: updates.cost_spike_lookback_days ?? current.cost_spike_lookback_days,
        cost_spike_min_history: updates.cost_spike_min_history ?? current.cost_spike_min_history,
        shrink_cost_warning: updates.shrink_cost_warning ?? current.shrink_cost_warning,
        shrink_cost_critical: updates.shrink_cost_critical ?? current.shrink_cost_critical,
        recipe_drift_warning_pct: updates.recipe_drift_warning_pct ?? current.recipe_drift_warning_pct,
        recipe_drift_critical_pct: updates.recipe_drift_critical_pct ?? current.recipe_drift_critical_pct,
        recipe_drift_lookback_days: updates.recipe_drift_lookback_days ?? current.recipe_drift_lookback_days,
        require_purchasing_authorization: updates.require_purchasing_authorization ?? current.require_purchasing_authorization,
        effective_from: new Date().toISOString(),
        effective_to: null,
        is_active: true,
        created_by: userId,
      });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    invalidateCache(orgId);
    return { success: true, version: nextVersion };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ── Purchasing Authorization ───────────────────────────────────

/**
 * Get purchasing authorization for a user at a venue.
 * Returns the authorization if one exists (venue-specific or org-wide).
 */
export async function getPurchasingAuthorization(
  orgId: string,
  userId: string,
  venueId: string
): Promise<PurchasingAuthorization | null> {
  const supabase = getServiceClient();

  // Look for venue-specific authorization first, then org-wide (venue_id IS NULL)
  const { data, error } = await (supabase as any)
    .from('purchasing_authorizations')
    .select('*')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .or(`venue_id.eq.${venueId},venue_id.is.null`)
    .order('venue_id', { ascending: false, nullsFirst: false }) // venue-specific first
    .limit(1);

  if (error || !data || data.length === 0) return null;

  return data[0] as PurchasingAuthorization;
}

/**
 * List all purchasing authorizations for an org.
 */
export async function listPurchasingAuthorizations(
  orgId: string
): Promise<PurchasingAuthorization[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('purchasing_authorizations')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as PurchasingAuthorization[];
}

/**
 * Check if a user is authorized to purchase specific items.
 * Returns unauthorized items if any.
 */
export async function checkPurchasingAuthorization(
  orgId: string,
  userId: string,
  venueId: string,
  itemIds: string[]
): Promise<AuthorizationCheckResult> {
  const auth = await getPurchasingAuthorization(orgId, userId, venueId);

  if (!auth) {
    // No authorization record → not authorized for anything
    // Fetch item names for the error message
    const names = await fetchItemNames(itemIds);
    return {
      authorized: false,
      unauthorizedItemIds: itemIds,
      unauthorizedItemNames: names,
    };
  }

  const authorizedSet = new Set(auth.authorized_item_ids);
  const unauthorizedIds = itemIds.filter((id) => !authorizedSet.has(id));

  if (unauthorizedIds.length === 0) {
    return { authorized: true, unauthorizedItemIds: [], unauthorizedItemNames: [] };
  }

  const names = await fetchItemNames(unauthorizedIds);
  return {
    authorized: false,
    unauthorizedItemIds: unauthorizedIds,
    unauthorizedItemNames: names,
  };
}

/**
 * Create or update a purchasing authorization.
 */
export async function upsertPurchasingAuthorization(params: {
  orgId: string;
  userId: string;
  venueId: string | null;
  authorizedItemIds: string[];
  notes?: string;
  createdBy?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getServiceClient();

  // Check for existing active authorization
  let query = (supabase as any)
    .from('purchasing_authorizations')
    .select('id')
    .eq('org_id', params.orgId)
    .eq('user_id', params.userId)
    .eq('is_active', true);

  if (params.venueId) {
    query = query.eq('venue_id', params.venueId);
  } else {
    query = query.is('venue_id', null);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    // Update existing
    const { error } = await (supabase as any)
      .from('purchasing_authorizations')
      .update({
        authorized_item_ids: params.authorizedItemIds,
        notes: params.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) return { success: false, error: error.message };
    return { success: true, id: existing.id };
  }

  // Insert new
  const { data, error } = await (supabase as any)
    .from('purchasing_authorizations')
    .insert({
      org_id: params.orgId,
      user_id: params.userId,
      venue_id: params.venueId,
      authorized_item_ids: params.authorizedItemIds,
      notes: params.notes ?? null,
      created_by: params.createdBy,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/**
 * Deactivate a purchasing authorization.
 */
export async function deactivatePurchasingAuthorization(
  authId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('purchasing_authorizations')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', authId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Helpers ────────────────────────────────────────────────────

function normalizeProcurementSettings(row: any): ProcurementSettings {
  return {
    org_id: row.org_id,
    version: row.version,
    cost_spike_z_threshold: parseFloat(row.cost_spike_z_threshold),
    cost_spike_lookback_days: row.cost_spike_lookback_days,
    cost_spike_min_history: row.cost_spike_min_history,
    shrink_cost_warning: parseFloat(row.shrink_cost_warning),
    shrink_cost_critical: parseFloat(row.shrink_cost_critical),
    recipe_drift_warning_pct: parseFloat(row.recipe_drift_warning_pct),
    recipe_drift_critical_pct: parseFloat(row.recipe_drift_critical_pct),
    recipe_drift_lookback_days: row.recipe_drift_lookback_days,
    require_purchasing_authorization: row.require_purchasing_authorization,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
  };
}

async function fetchItemNames(itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('items')
    .select('id, name')
    .in('id', itemIds);

  if (!data) return itemIds; // fallback to IDs

  const nameMap = new Map<string, string>();
  for (const item of data) {
    nameMap.set(item.id, item.name);
  }

  return itemIds.map((id) => nameMap.get(id) || id);
}
