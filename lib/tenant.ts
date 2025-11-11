import { createClient as createServiceClient } from '@supabase/supabase-js';

export type UserTenantContext = {
  orgId: string;
  role: 'owner' | 'admin' | 'manager' | 'viewer';
  venueIds: string[];
};

/**
 * Derives organization and venue access from authenticated user
 * Replaces hardcoded organization IDs
 */
export async function getUserOrgAndVenues(
  userId: string
): Promise<UserTenantContext> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get user's organization membership
  const { data: orgs, error } = await supabase
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

  // Get all venues for this organization
  const { data: venues } = await supabase
    .from('venues')
    .select('id')
    .eq('organization_id', orgId);

  const venueIds = (venues || []).map((v) => v.id);

  return { orgId, role, venueIds };
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
