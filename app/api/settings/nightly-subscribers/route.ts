/**
 * Nightly Report Subscribers API
 *
 * GET  — List subscribers for the user's org
 * POST — Add a subscriber (owner/admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import {
  getAllSubscribers,
  addSubscriber,
} from '@/lib/database/nightly-subscribers';
import { getServiceClient } from '@/lib/supabase/service';
import { validate } from '@/lib/validate';
import { z } from 'zod';

const addSubscriberSchema = z.object({
  user_id: z.string().uuid(),
  venue_scope: z.enum(['all', 'selected', 'auto']).optional().default('auto'),
  venue_ids: z.array(z.string().uuid()).optional().nullable(),
});

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':nightly-subscribers');
    const user = await requireUser();
    const { orgId } = await getUserOrgAndVenues(user.id);

    const subscribers = await getAllSubscribers(orgId);

    return NextResponse.json({ success: true, subscribers });
  });
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const validated = validate(addSubscriberSchema, body);

    // Resolve email from auth.users, fallback to legacy users table
    const supabase = getServiceClient();
    let email: string | undefined;

    const { data: userData } = await supabase.auth.admin.getUserById(validated.user_id);
    email = userData?.user?.email || undefined;

    if (!email) {
      const { data: legacyUser } = await (supabase as any)
        .from('users')
        .select('email')
        .eq('id', validated.user_id)
        .maybeSingle();
      email = legacyUser?.email || undefined;
    }

    if (!email) {
      throw {
        status: 400,
        code: 'USER_NOT_FOUND',
        message: 'Could not resolve email for the specified user',
      };
    }

    const subscriber = await addSubscriber({
      orgId,
      userId: validated.user_id,
      email,
      venueScope: validated.venue_scope,
      venueIds: validated.venue_ids || null,
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, subscriber });
  });
}
