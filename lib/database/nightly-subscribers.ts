/**
 * lib/database/nightly-subscribers.ts
 * Data access layer for nightly report subscriber management.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ────────────────────────────────────────────────────────

export interface NightlySubscriber {
  id: string;
  org_id: string;
  user_id: string;
  email: string;
  venue_scope: 'all' | 'selected' | 'auto';
  venue_ids: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface BriefingOrg {
  id: string;
  name: string;
  logo_url: string | null;
  timezone: string | null;
}

export interface OrgVenue {
  id: string;
  name: string;
}

// ── Queries ──────────────────────────────────────────────────────

/**
 * Fetch all orgs that have daily_briefing_enabled = true.
 */
export async function getOrgsWithBriefingEnabled(): Promise<BriefingOrg[]> {
  const supabase = getServiceClient();

  const { data: settings } = await (supabase as any)
    .from('organization_settings')
    .select('organization_id')
    .eq('daily_briefing_enabled', true);

  if (!settings || settings.length === 0) return [];

  const orgIds = settings.map((s: any) => s.organization_id);

  const { data: orgs } = await (supabase as any)
    .from('organizations')
    .select('id, name, logo_url, timezone')
    .in('id', orgIds)
    .eq('is_active', true);

  return orgs || [];
}

/**
 * Fetch all active subscribers for an org.
 */
export async function getActiveSubscribers(orgId: string): Promise<NightlySubscriber[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('nightly_report_subscribers')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (error) {
    console.error('[nightly-subscribers] Failed to fetch subscribers:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Fetch ALL subscribers for an org (including inactive) — for settings UI.
 */
export async function getAllSubscribers(orgId: string): Promise<NightlySubscriber[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('nightly_report_subscribers')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[nightly-subscribers] Failed to fetch subscribers:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Resolve a subscriber's effective venue list.
 *
 * - 'all' → all active venues
 * - 'selected' → specific venue_ids
 * - 'auto' → look up organization_users.venue_ids:
 *     NULL → all venues (consolidated)
 *     specific → those venues (per-venue)
 */
export async function resolveSubscriberVenues(
  subscriber: NightlySubscriber,
  orgVenues: OrgVenue[]
): Promise<{ venues: OrgVenue[]; isConsolidated: boolean }> {
  if (subscriber.venue_scope === 'all') {
    return { venues: orgVenues, isConsolidated: true };
  }

  if (subscriber.venue_scope === 'selected' && subscriber.venue_ids) {
    const selectedIds = new Set(subscriber.venue_ids);
    return {
      venues: orgVenues.filter((v) => selectedIds.has(v.id)),
      isConsolidated: subscriber.venue_ids.length > 1,
    };
  }

  // 'auto' — look up organization_users.venue_ids
  const supabase = getServiceClient();
  const { data: membership } = await (supabase as any)
    .from('organization_users')
    .select('venue_ids')
    .eq('user_id', subscriber.user_id)
    .eq('organization_id', subscriber.org_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership || membership.venue_ids === null) {
    // Org-level user → all venues consolidated
    return { venues: orgVenues, isConsolidated: true };
  }

  // Venue-specific user
  const userVenueIds = new Set(membership.venue_ids as string[]);
  const filtered = orgVenues.filter((v) => userVenueIds.has(v.id));
  return {
    venues: filtered,
    isConsolidated: filtered.length > 1,
  };
}

/**
 * Fetch active venues for an org.
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

/**
 * Fetch venue → tipsee location mappings for an org's venues.
 */
export async function getVenueTipseeMappings(
  venueIds: string[]
): Promise<Map<string, string>> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('venue_tipsee_mapping')
    .select('venue_id, tipsee_location_uuid')
    .in('venue_id', venueIds)
    .eq('is_active', true);

  const map = new Map<string, string>();
  for (const row of data || []) {
    map.set(row.venue_id, row.tipsee_location_uuid);
  }
  return map;
}

// ── CRUD ─────────────────────────────────────────────────────────

export async function addSubscriber(params: {
  orgId: string;
  userId: string;
  email: string;
  venueScope?: 'all' | 'selected' | 'auto';
  venueIds?: string[] | null;
  createdBy: string;
}): Promise<NightlySubscriber> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('nightly_report_subscribers')
    .insert({
      org_id: params.orgId,
      user_id: params.userId,
      email: params.email,
      venue_scope: params.venueScope || 'auto',
      venue_ids: params.venueIds || null,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSubscriber(
  id: string,
  orgId: string,
  updates: Partial<Pick<NightlySubscriber, 'venue_scope' | 'venue_ids' | 'is_active'>>
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('nightly_report_subscribers')
    .update(updates)
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) throw error;
}

export async function removeSubscriber(id: string, orgId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('nightly_report_subscribers')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) throw error;
}

// ── Logging ──────────────────────────────────────────────────────

export async function logReportRun(params: {
  orgId: string;
  businessDate: string;
  sent: number;
  failed: number;
  startedAt: Date;
  error?: string;
  details?: Record<string, any>;
}): Promise<void> {
  const supabase = getServiceClient();
  const completedAt = new Date();

  await (supabase as any)
    .from('nightly_report_log')
    .insert({
      org_id: params.orgId,
      business_date: params.businessDate,
      subscribers_sent: params.sent,
      subscribers_failed: params.failed,
      started_at: params.startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      total_duration_ms: completedAt.getTime() - params.startedAt.getTime(),
      error_message: params.error || null,
      details: params.details || {},
    });
}
