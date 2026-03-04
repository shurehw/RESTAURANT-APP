/**
 * lib/database/team.ts
 * Data access layer for team member and invite management.
 */

import { getServiceClient } from '@/lib/supabase/service';
import crypto from 'crypto';

// ── Types ────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  venue_ids: string[] | null;
  is_active: boolean;
  invited_at: string | null;
  accepted_at: string | null;
}

export interface PendingInvite {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  venue_ids: string[] | null;
  token: string;
  invited_by: string;
  inviter_name: string | null;
  expires_at: string;
  created_at: string;
}

export interface OrgVenue {
  id: string;
  name: string;
}

// ── Members ──────────────────────────────────────────────────────

/**
 * Fetch all organization members with resolved email/name from auth.users.
 */
export async function getTeamMembers(orgId: string): Promise<TeamMember[]> {
  const supabase = getServiceClient();

  const { data: rows, error } = await (supabase as any)
    .from('organization_users')
    .select('id, user_id, role, venue_ids, is_active, invited_at, accepted_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[team] Failed to fetch members:', error.message);
    return [];
  }

  if (!rows || rows.length === 0) return [];

  // Resolve email + name from auth.users
  const members: TeamMember[] = [];
  for (const row of rows) {
    let email = '';
    let fullName = '';
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(row.user_id);
      email = userData?.user?.email || '';
      fullName = userData?.user?.user_metadata?.full_name || '';
    } catch {
      // If auth lookup fails, try legacy users table
      const { data: legacyUser } = await (supabase as any)
        .from('users')
        .select('email, full_name')
        .eq('id', row.user_id)
        .maybeSingle();
      email = legacyUser?.email || '';
      fullName = legacyUser?.full_name || '';
    }

    members.push({
      id: row.id,
      user_id: row.user_id,
      email,
      full_name: fullName,
      role: row.role,
      venue_ids: row.venue_ids,
      is_active: row.is_active ?? true,
      invited_at: row.invited_at,
      accepted_at: row.accepted_at,
    });
  }

  return members;
}

/**
 * Update a member's role, venue_ids, or is_active.
 */
export async function updateMember(
  orgId: string,
  userId: string,
  updates: { role?: string; venue_ids?: string[] | null; is_active?: boolean }
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('organization_users')
    .update(updates)
    .eq('organization_id', orgId)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Soft-deactivate a member.
 */
export async function deactivateMember(orgId: string, userId: string): Promise<void> {
  return updateMember(orgId, userId, { is_active: false });
}

// ── Invites ──────────────────────────────────────────────────────

/**
 * Fetch pending (non-expired, non-revoked, non-accepted) invites for an org.
 */
export async function getPendingInvites(orgId: string): Promise<PendingInvite[]> {
  const supabase = getServiceClient();

  const { data: rows, error } = await (supabase as any)
    .from('organization_invites')
    .select('*')
    .eq('organization_id', orgId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[team] Failed to fetch invites:', error.message);
    return [];
  }

  if (!rows || rows.length === 0) return [];

  // Resolve inviter names
  const invites: PendingInvite[] = [];
  for (const row of rows) {
    let inviterName: string | null = null;
    try {
      const { data: inviterData } = await supabase.auth.admin.getUserById(row.invited_by);
      inviterName = inviterData?.user?.user_metadata?.full_name || inviterData?.user?.email || null;
    } catch {
      // ignore
    }

    invites.push({
      id: row.id,
      organization_id: row.organization_id,
      email: row.email,
      role: row.role,
      venue_ids: row.venue_ids,
      token: row.token,
      invited_by: row.invited_by,
      inviter_name: inviterName,
      expires_at: row.expires_at,
      created_at: row.created_at,
    });
  }

  return invites;
}

/**
 * Create a new invite with generated token and 7-day expiry.
 */
export async function createInvite(params: {
  orgId: string;
  email: string;
  role: string;
  venueIds: string[] | null;
  invitedBy: string;
}): Promise<PendingInvite> {
  const supabase = getServiceClient();

  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data, error } = await (supabase as any)
    .from('organization_invites')
    .insert({
      organization_id: params.orgId,
      email: params.email.toLowerCase(),
      role: params.role,
      venue_ids: params.venueIds,
      token,
      invited_by: params.invitedBy,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    inviter_name: null,
  };
}

/**
 * Revoke an invite by setting revoked_at.
 */
export async function revokeInvite(id: string, orgId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('organization_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

/**
 * Look up an invite by token. Validates it's still active and not expired.
 * Returns invite details + org name for the accept page.
 */
export async function getInviteByToken(token: string): Promise<{
  id: string;
  organization_id: string;
  org_name: string;
  email: string;
  role: string;
  venue_ids: string[] | null;
  invited_by: string;
  expires_at: string;
} | null> {
  const supabase = getServiceClient();

  const { data: invite, error } = await (supabase as any)
    .from('organization_invites')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gte('expires_at', new Date().toISOString())
    .single();

  if (error || !invite) return null;

  // Get org name
  const { data: org } = await (supabase as any)
    .from('organizations')
    .select('name')
    .eq('id', invite.organization_id)
    .single();

  return {
    id: invite.id,
    organization_id: invite.organization_id,
    org_name: org?.name || 'Unknown Organization',
    email: invite.email,
    role: invite.role,
    venue_ids: invite.venue_ids,
    invited_by: invite.invited_by,
    expires_at: invite.expires_at,
  };
}

/**
 * Mark an invite as accepted.
 */
export async function markInviteAccepted(inviteId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('organization_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inviteId);

  if (error) throw error;
}

/**
 * Extend an invite's expiry by 7 days (for resend).
 */
export async function extendInviteExpiry(id: string, orgId: string): Promise<void> {
  const supabase = getServiceClient();
  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + 7);

  const { error } = await (supabase as any)
    .from('organization_invites')
    .update({ expires_at: newExpiry.toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

/**
 * Fetch active venues for an org (for venue checkboxes).
 */
export async function getOrgVenues(orgId: string): Promise<OrgVenue[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('venues')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name');

  return data || [];
}
