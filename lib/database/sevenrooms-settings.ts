/**
 * lib/database/sevenrooms-settings.ts
 * Data access layer for per-venue SevenRooms integration settings & pacing overrides.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ────────────────────────────────────────────────────────

export interface SevenRoomsVenueSettings {
  id: string;
  org_id: string;
  venue_id: string;
  sr_venue_id: string | null;
  is_connected: boolean;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'error' | 'pending' | null;
  last_sync_error: string | null;
  covers_per_interval: number | null;
  custom_pacing: Record<string, number>;
  interval_minutes: number | null;
  turn_time_overrides: Record<string, number>;
  last_push_at: string | null;
  last_push_status: 'success' | 'error' | 'unsupported' | null;
  last_push_error: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

// ── Queries ──────────────────────────────────────────────────────

/**
 * Get all SR venue settings for an org, joined with venue name.
 */
export async function getSettingsForOrg(
  orgId: string,
): Promise<(SevenRoomsVenueSettings & { venue_name: string })[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('sevenrooms_venue_settings')
    .select('*, venues!inner(name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[sr-settings] Failed to fetch settings:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    ...row,
    venue_name: row.venues?.name ?? 'Unknown',
    venues: undefined,
  }));
}

/**
 * Get SR settings for a specific venue.
 */
export async function getSettingsForVenue(
  venueId: string,
): Promise<SevenRoomsVenueSettings | null> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('sevenrooms_venue_settings')
    .select('*')
    .eq('venue_id', venueId)
    .maybeSingle();

  if (error) {
    console.error('[sr-settings] Failed to fetch venue settings:', error.message);
    return null;
  }

  return data;
}

// ── CRUD ─────────────────────────────────────────────────────────

/**
 * Upsert pacing/turn-time overrides for a venue.
 */
export async function upsertSettings(
  venueId: string,
  orgId: string,
  updates: Partial<Pick<
    SevenRoomsVenueSettings,
    'sr_venue_id' | 'is_connected' | 'covers_per_interval' | 'custom_pacing' | 'interval_minutes' | 'turn_time_overrides'
  >>,
  userId?: string,
): Promise<SevenRoomsVenueSettings> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('sevenrooms_venue_settings')
    .upsert(
      {
        venue_id: venueId,
        org_id: orgId,
        ...updates,
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'venue_id' },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update sync status after reading from SR API.
 */
export async function updateSyncStatus(
  venueId: string,
  status: 'success' | 'error' | 'pending',
  error?: string,
): Promise<void> {
  const supabase = getServiceClient();

  const { error: dbError } = await (supabase as any)
    .from('sevenrooms_venue_settings')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error: error || null,
    })
    .eq('venue_id', venueId);

  if (dbError) {
    console.error('[sr-settings] Failed to update sync status:', dbError.message);
  }
}

/**
 * Update push status after writing to SR API.
 */
export async function updatePushStatus(
  venueId: string,
  status: 'success' | 'error' | 'unsupported',
  error?: string,
): Promise<void> {
  const supabase = getServiceClient();

  const { error: dbError } = await (supabase as any)
    .from('sevenrooms_venue_settings')
    .update({
      last_push_at: new Date().toISOString(),
      last_push_status: status,
      last_push_error: error || null,
    })
    .eq('venue_id', venueId);

  if (dbError) {
    console.error('[sr-settings] Failed to update push status:', dbError.message);
  }
}
