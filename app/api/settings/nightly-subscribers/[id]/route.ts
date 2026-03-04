/**
 * Nightly Report Subscriber Management
 *
 * PATCH  — Update subscriber (venue_scope, venue_ids, is_active)
 * DELETE — Remove subscriber
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { updateSubscriber, removeSubscriber } from '@/lib/database/nightly-subscribers';
import { validate } from '@/lib/validate';
import { z } from 'zod';

const updateSchema = z.object({
  venue_scope: z.enum(['all', 'selected', 'auto']).optional(),
  venue_ids: z.array(z.string().uuid()).optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':nightly-subscribers');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'admin'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners and admins can manage nightly report subscribers',
      };
    }

    const { id } = await params;
    const body = await request.json();
    const validated = validate(updateSchema, body);

    await updateSubscriber(id, orgId, validated);

    return NextResponse.json({ success: true });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':nightly-subscribers');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'admin'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners and admins can manage nightly report subscribers',
      };
    }

    const { id } = await params;
    await removeSubscriber(id, orgId);

    return NextResponse.json({ success: true });
  });
}
