/**
 * Simphony BI Token Manager
 *
 * Handles token persistence, auto-refresh, and location mapping lookups
 * for the Oracle Simphony BI API integration.
 *
 * Follows sales-pace.ts patterns: service client, in-memory cache, typed interfaces.
 */

import { getServiceClient } from '@/lib/supabase/service';
import {
  refreshTokens,
  SimphonyAuthExpiredError,
  type SimphonyBIConfig,
  type SimphonyTokenSet,
} from '@/lib/integrations/simphony-bi';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface SimphonyTokenRow {
  id: string;
  org_identifier: string;
  client_id: string;
  auth_server: string;
  app_server: string;
  id_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  last_refreshed_at: string | null;
}

export interface SimphonyLocationMapping {
  venue_id: string;
  loc_ref: string;
  org_identifier: string;
  bar_revenue_centers: number[];
  is_active: boolean;
}

// ══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// ══════════════════════════════════════════════════════════════════════════

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const tokenCache = new Map<string, { data: SimphonyTokenRow; ts: number }>();
const mappingCache = new Map<string, { data: SimphonyLocationMapping | null; ts: number }>();

function isFresh(ts: number): boolean {
  return Date.now() - ts < CACHE_TTL_MS;
}

// ══════════════════════════════════════════════════════════════════════════
// TOKEN QUERIES
// ══════════════════════════════════════════════════════════════════════════

/**
 * Read token row from Supabase (cached 5-min).
 */
async function getSimphonyTokenRow(
  orgIdentifier: string
): Promise<SimphonyTokenRow | null> {
  const cached = tokenCache.get(orgIdentifier);
  if (cached && isFresh(cached.ts)) return cached.data;

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('simphony_bi_tokens')
    .select('*')
    .eq('org_identifier', orgIdentifier)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[simphony-tokens] Failed to fetch tokens:', error.message);
    return null;
  }

  tokenCache.set(orgIdentifier, { data, ts: Date.now() });
  return data;
}

/**
 * Save tokens to Supabase (upsert by org_identifier).
 */
async function saveSimphonyTokens(
  orgIdentifier: string,
  tokens: SimphonyTokenSet
): Promise<void> {
  const supabase = getServiceClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
  const refreshExpiresAt = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000); // 28 days

  const { error } = await (supabase as any)
    .from('simphony_bi_tokens')
    .update({
      id_token: tokens.id_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt.toISOString(),
      refresh_expires_at: refreshExpiresAt.toISOString(),
      last_refreshed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('org_identifier', orgIdentifier);

  if (error) {
    console.error('[simphony-tokens] Failed to save tokens:', error.message);
    throw error;
  }

  // Invalidate cache so next read picks up new tokens
  tokenCache.delete(orgIdentifier);
}

/**
 * Get a valid id_token, auto-refreshing if needed.
 * Throws SimphonyAuthExpiredError if both tokens have expired.
 */
export async function getValidIdToken(
  orgIdentifier: string
): Promise<string> {
  const row = await getSimphonyTokenRow(orgIdentifier);
  if (!row || !row.id_token || !row.refresh_token) {
    throw new SimphonyAuthExpiredError(
      `No Simphony BI tokens found for org '${orgIdentifier}'. Run bootstrap script.`
    );
  }

  // Check if id_token is still valid (with 3-day buffer)
  if (row.token_expires_at) {
    const expiresAt = new Date(row.token_expires_at);
    const bufferMs = 3 * 24 * 60 * 60 * 1000; // 3 days
    if (expiresAt.getTime() - Date.now() > bufferMs) {
      return row.id_token;
    }
  }

  // Need to refresh — check if refresh_token is still valid
  if (row.refresh_expires_at) {
    const refreshExpiresAt = new Date(row.refresh_expires_at);
    if (refreshExpiresAt.getTime() < Date.now()) {
      throw new SimphonyAuthExpiredError(
        `Simphony BI refresh token expired for org '${orgIdentifier}'. Re-run bootstrap.`
      );
    }
  }

  // Refresh the token
  console.log(`[simphony-tokens] Refreshing id_token for org '${orgIdentifier}'`);
  const config: SimphonyBIConfig = {
    authServer: row.auth_server,
    appServer: row.app_server,
    clientId: row.client_id,
    orgIdentifier,
  };

  const newTokens = await refreshTokens(config, row.refresh_token);
  await saveSimphonyTokens(orgIdentifier, newTokens);

  return newTokens.id_token;
}

/**
 * Get the Simphony BI config for an org (auth/app server URLs, client ID).
 */
export async function getSimphonyConfig(
  orgIdentifier: string
): Promise<SimphonyBIConfig> {
  const row = await getSimphonyTokenRow(orgIdentifier);
  if (!row) {
    throw new Error(`No Simphony BI config for org '${orgIdentifier}'`);
  }
  return {
    authServer: row.auth_server,
    appServer: row.app_server,
    clientId: row.client_id,
    orgIdentifier,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// LOCATION MAPPING
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get Simphony location mapping for a venue (cached 5-min).
 * Returns null if venue has no Simphony BI mapping (non-Simphony venue).
 */
export async function getSimphonyLocationMapping(
  venueId: string
): Promise<SimphonyLocationMapping | null> {
  const cached = mappingCache.get(venueId);
  if (cached && isFresh(cached.ts)) return cached.data;

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('simphony_bi_location_mapping')
    .select('venue_id, loc_ref, org_identifier, bar_revenue_centers, is_active')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      mappingCache.set(venueId, { data: null, ts: Date.now() });
      return null;
    }
    console.error('[simphony-tokens] Failed to fetch location mapping:', error.message);
    return null;
  }

  mappingCache.set(venueId, { data, ts: Date.now() });
  return data;
}
