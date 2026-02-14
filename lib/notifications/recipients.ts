/**
 * Recipient Resolver
 *
 * Finds users who should receive enforcement notifications based on
 * feedback/enforcement role + venue assignment.
 *
 * Role mapping (feedback role → org_users role):
 *   venue_manager → manager with venue in venue_ids[] (or NULL = all venues)
 *   gm            → admin with venue access
 *   corporate     → owner
 *   purchasing    → manager or admin with venue access
 */

import { getServiceClient } from '@/lib/supabase/service';

export interface Recipient {
  userId: string;
  email: string;
}

/**
 * Maps feedback/enforcement roles to organization_users roles.
 * Returns which org roles should be queried.
 */
function mapFeedbackRoleToOrgRoles(targetRole: string): string[] {
  switch (targetRole) {
    case 'venue_manager':
      return ['manager'];
    case 'gm':
      return ['admin'];
    case 'agm':
      return ['admin', 'manager'];
    case 'corporate':
      return ['owner'];
    case 'purchasing':
      return ['manager', 'admin'];
    default:
      return ['manager', 'admin', 'owner'];
  }
}

/**
 * Resolve recipients for a notification based on org, venue, and target role.
 *
 * Filters by:
 *   1. Organization membership (org_id)
 *   2. Role match (feedback role → org role)
 *   3. Venue access (venue_ids contains venueId, or venue_ids IS NULL = all venues)
 *   4. Active users only
 */
export async function resolveRecipients(
  orgId: string,
  venueId: string,
  targetRole: string
): Promise<Recipient[]> {
  const supabase = getServiceClient();
  const orgRoles = mapFeedbackRoleToOrgRoles(targetRole);

  // Fetch org users matching the role criteria
  const { data: orgUsers, error } = await (supabase as any)
    .from('organization_users')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .in('role', orgRoles);

  if (error) {
    console.error('[Recipients] Failed to fetch org users:', error.message);
    return [];
  }

  if (!orgUsers || orgUsers.length === 0) return [];

  // Filter by venue access: venue_ids contains venueId, or venue_ids is NULL (all venues)
  // Supabase can't filter arrays with contains + is null in a single query,
  // so we do a light post-filter here
  const { data: fullUsers, error: fullErr } = await (supabase as any)
    .from('organization_users')
    .select('user_id, venue_ids')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .in('role', orgRoles);

  if (fullErr || !fullUsers) return [];

  const matchingUserIds: string[] = [];
  for (const user of fullUsers) {
    // NULL venue_ids = access to all venues
    if (user.venue_ids === null) {
      matchingUserIds.push(user.user_id);
    } else if (Array.isArray(user.venue_ids) && user.venue_ids.includes(venueId)) {
      matchingUserIds.push(user.user_id);
    }
  }

  if (matchingUserIds.length === 0) return [];

  // Fetch email addresses from auth.users via admin API
  const recipients: Recipient[] = [];
  for (const userId of matchingUserIds) {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (userData?.user?.email) {
      recipients.push({
        userId,
        email: userData.user.email,
      });
    } else {
      // Still include as recipient even without email (for in-app notifications)
      recipients.push({ userId, email: '' });
    }
  }

  return recipients;
}
