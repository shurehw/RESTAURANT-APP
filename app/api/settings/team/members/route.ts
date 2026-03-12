/**
 * Team Members API
 *
 * GET — List members + venues for the user's org
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { getTeamMembers, getOrgVenues } from '@/lib/database/team';

export async function GET(request: NextRequest) {
  return guard(async () => {
    await rateLimit(request, ':team-members');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'admin', 'director'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners, admins, and directors can manage team members',
      };
    }

    const [members, venues] = await Promise.all([
      getTeamMembers(orgId),
      getOrgVenues(orgId),
    ]);

    return NextResponse.json({ success: true, members, venues });
  });
}
