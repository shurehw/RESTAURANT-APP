/**
 * Weekly Share Tokens — Data Access Layer
 *
 * Creates and validates token-gated share links for weekly agenda pages.
 * Tokens allow GMs to access a specific venue+week report without login.
 */

import { randomUUID } from 'crypto';
import { getServiceClient } from '@/lib/supabase/service';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface ShareToken {
  id: string;
  token: string;
  venue_id: string;
  week_start: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  is_active: boolean;
  accessed_count: number;
  last_accessed_at: string | null;
}

export interface ValidatedToken {
  venue_id: string;
  week_start: string;
  venue_name: string;
  organization_id: string;
}

// ══════════════════════════════════════════════════════════════════════════
// CREATE
// ══════════════════════════════════════════════════════════════════════════

export async function createShareToken(
  venueId: string,
  weekStart: string,
  createdBy?: string,
  expiresInDays: number = 7,
): Promise<{ token: string; expires_at: string }> {
  const supabase = getServiceClient();
  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const { data, error } = await (supabase as any)
    .from('weekly_share_tokens')
    .insert({
      token,
      venue_id: venueId,
      week_start: weekStart,
      created_by: createdBy ?? null,
      expires_at: expiresAt.toISOString(),
    })
    .select('token, expires_at')
    .single();

  if (error) {
    throw new Error(`Failed to create share token: ${error.message}`);
  }

  return { token: data.token, expires_at: data.expires_at };
}

// ══════════════════════════════════════════════════════════════════════════
// VALIDATE
// ══════════════════════════════════════════════════════════════════════════

export async function validateShareToken(
  token: string,
): Promise<ValidatedToken | null> {
  const supabase = getServiceClient();

  // Look up token + join venue for name and org
  const { data, error } = await (supabase as any)
    .from('weekly_share_tokens')
    .select('venue_id, week_start, is_active, expires_at, venues(name, organization_id)')
    .eq('token', token)
    .single();

  if (error || !data) return null;

  // Check active + not expired
  if (!data.is_active) return null;
  if (new Date(data.expires_at) < new Date()) return null;

  // Track access (fire-and-forget)
  (supabase as any)
    .from('weekly_share_tokens')
    .update({
      accessed_count: (data.accessed_count ?? 0) + 1,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('token', token)
    .then(() => {});

  return {
    venue_id: data.venue_id,
    week_start: data.week_start,
    venue_name: data.venues?.name ?? 'Unknown Venue',
    organization_id: data.venues?.organization_id ?? '',
  };
}

// ══════════════════════════════════════════════════════════════════════════
// DEACTIVATE
// ══════════════════════════════════════════════════════════════════════════

export async function deactivateShareToken(token: string): Promise<void> {
  const supabase = getServiceClient();
  await (supabase as any)
    .from('weekly_share_tokens')
    .update({ is_active: false })
    .eq('token', token);
}
