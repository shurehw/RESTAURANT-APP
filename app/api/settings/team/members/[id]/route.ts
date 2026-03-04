/**
 * Team Member Detail API
 *
 * PATCH  — Update member role, venue_ids, or is_active
 * DELETE — Deactivate member (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate } from '@/lib/validate';
import { updateMember, deactivateMember } from '@/lib/database/team';
import { z } from 'zod';

const VALID_ROLES = [
  'owner', 'director', 'gm', 'agm', 'manager',
  'exec_chef', 'sous_chef', 'readonly', 'pwa',
] as const;

const updateMemberSchema = z.object({
  role: z.enum(VALID_ROLES).optional(),
  venue_ids: z.array(z.string().uuid()).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':team-members');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);
    const { id: targetUserId } = await params;

    if (!['owner', 'admin', 'director'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners, admins, and directors can manage team members',
      };
    }

    // Can't edit yourself
    if (targetUserId === user.id) {
      throw {
        status: 400,
        code: 'CANNOT_EDIT_SELF',
        message: 'You cannot edit your own membership',
      };
    }

    const body = await request.json();
    const validated = validate(updateMemberSchema, body);

    await updateMember(orgId, targetUserId, validated);

    return NextResponse.json({ success: true });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':team-members');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);
    const { id: targetUserId } = await params;

    if (!['owner', 'admin', 'director'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners, admins, and directors can manage team members',
      };
    }

    if (targetUserId === user.id) {
      throw {
        status: 400,
        code: 'CANNOT_DEACTIVATE_SELF',
        message: 'You cannot deactivate yourself',
      };
    }

    await deactivateMember(orgId, targetUserId);

    return NextResponse.json({ success: true });
  });
}
