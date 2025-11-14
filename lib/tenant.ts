import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type UserTenantContext = {
  orgId: string;
  role: 'owner' | 'admin' | 'manager' | 'viewer';
  venueIds: string[];
};

/**
 * Derives organization and venue access from authenticated user
 * Uses user-scoped Supabase client (respects RLS)
 */
export async function getUserOrgAndVenues(
  userId: string,
  supabase?: SupabaseClient
): Promise<UserTenantContext> {
  const client = supabase || (await createClient());

  // Get user's organization membership (RLS-protected)
  const { data: orgs, error } = await client
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', userId);

  if (error || !orgs || orgs.length === 0) {
    throw {
      status: 403,
      code: 'NO_ORG',
      message: 'No organization access',
    };
  }

  const orgId = orgs[0].organization_id;
  const role = orgs[0].role as 'owner' | 'admin' | 'manager' | 'viewer';

  // Get all venues for this organization (RLS-protected)
  const { data: venues } = await client
    .from('venues')
    .select('id')
    .eq('organization_id', orgId);

  const venueIds = (venues || []).map((v) => v.id);

  return { orgId, role, venueIds };
}

/**
 * Gets all organizations the user belongs to
 * Supports multi-org scenarios
 */
export async function getUserOrganizations(
  userId: string,
  supabase?: SupabaseClient
): Promise<Array<{ orgId: string; role: string; venueIds: string[] }>> {
  const client = supabase || (await createClient());

  // Get all organization memberships (RLS-protected)
  const { data: orgs, error } = await client
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', userId);

  if (error || !orgs || orgs.length === 0) {
    throw {
      status: 403,
      code: 'NO_ORG',
      message: 'No organization access',
    };
  }

  // For each org, get venues
  const results = await Promise.all(
    orgs.map(async (org) => {
      const { data: venues } = await client
        .from('venues')
        .select('id')
        .eq('organization_id', org.organization_id);

      return {
        orgId: org.organization_id,
        role: org.role,
        venueIds: (venues || []).map((v) => v.id),
      };
    })
  );

  return results;
}

/**
 * Validates that user has access to a specific venue
 * Throws 403 if access denied
 */
export function assertVenueAccess(
  venueId: string,
  allowedVenueIds: string[]
): void {
  if (!allowedVenueIds.includes(venueId)) {
    throw {
      status: 403,
      code: 'FORBIDDEN',
      message: 'No access to this venue',
    };
  }
}

/**
 * Validates that user has required role (owner/admin/manager only)
 * Throws 403 if insufficient permissions
 */
export function assertRole(
  userRole: string,
  requiredRoles: string[]
): void {
  if (!requiredRoles.includes(userRole)) {
    throw {
      status: 403,
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Requires one of: ${requiredRoles.join(', ')}`,
    };
  }
}

/**
 * Validates that user belongs to a specific organization
 * Throws 403 if not a member
 */
export async function assertUserOrgAccess(
  userId: string,
  orgId: string,
  supabase?: SupabaseClient
): Promise<void> {
  const client = supabase || (await createClient());

  const { data, error } = await client
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data) {
    throw {
      status: 403,
      code: 'FORBIDDEN',
      message: 'No access to this organization',
    };
  }
}
