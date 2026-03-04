/**
 * Organization Users API
 *
 * GET — List users in the current org with user_id, email, role, venue_ids.
 *       Used by the nightly report subscriber management UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':org-users');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'admin'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners and admins can list organization users',
      };
    }

    const supabase = getServiceClient();

    // Fetch org users
    const { data: orgUsers, error } = await (supabase as any)
      .from('organization_users')
      .select('user_id, role, venue_ids, is_active')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('role');

    if (error) throw error;

    // Resolve emails from auth.users
    const users = await Promise.all(
      (orgUsers || []).map(async (ou: any) => {
        const { data: userData } = await supabase.auth.admin.getUserById(ou.user_id);
        return {
          user_id: ou.user_id,
          email: userData?.user?.email || '',
          full_name: userData?.user?.user_metadata?.full_name || userData?.user?.email || '',
          role: ou.role,
          venue_ids: ou.venue_ids,
        };
      })
    );

    return NextResponse.json({ success: true, users });
  });
}
