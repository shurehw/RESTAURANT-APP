import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { assertRole, assertVenueAccess, getUserOrgAndVenues } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import { assignCommitment } from '@/lib/database/signal-outcomes';

type RouteContext = { params: Promise<{ signalId: string }> };

const actorRoles = ['owner', 'admin', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef'];

const schema = z.object({
  assigned_to_user_id: z.string().uuid().optional(),
  assigned_to_name: z.string().trim().min(1).max(120).optional(),
  follow_up_date: z.string().date().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const user = await requireUser();
    const { role, venueIds } = await getUserOrgAndVenues(user.id);
    assertRole(role, actorRoles);

    const { signalId } = await ctx.params;
    const body = schema.parse(await req.json().catch(() => ({})));
    const supabase = getServiceClient();

    const { data: signal, error: signalError } = await (supabase as any)
      .from('attestation_signals')
      .select('id, venue_id, signal_type')
      .eq('id', signalId)
      .single();

    if (signalError || !signal) {
      return NextResponse.json({ error: 'Commitment not found' }, { status: 404 });
    }
    if (signal.signal_type !== 'action_commitment') {
      return NextResponse.json({ error: 'Only action commitments can be assigned' }, { status: 400 });
    }
    assertVenueAccess(signal.venue_id, venueIds);

    const assignedToUserId = body.assigned_to_user_id ?? user.id;
    let assignedToName: string | undefined = body.assigned_to_name;

    if (!assignedToName) {
      const { data: profile } = await (supabase as any)
        .from('user_profiles')
        .select('full_name')
        .eq('id', assignedToUserId)
        .maybeSingle();
      assignedToName = profile?.full_name || user.email || 'Assigned user';
    }

    const updated = await assignCommitment(signalId, {
      assigned_to_user_id: assignedToUserId,
      assigned_to_name: assignedToName || user.email || 'Assigned user',
      follow_up_date: body.follow_up_date,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Failed to assign commitment' }, { status: 500 });
    }

    const { data: refreshed } = await (supabase as any)
      .from('attestation_signals')
      .select('*')
      .eq('id', signalId)
      .single();

    return NextResponse.json({ success: true, data: refreshed });
  });
}
