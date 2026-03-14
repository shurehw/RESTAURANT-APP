import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { assertRole, assertVenueAccess, getUserOrgAndVenues } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import { resolveCommitmentAction } from '@/lib/database/signal-outcomes';

type RouteContext = { params: Promise<{ signalId: string }> };

const actorRoles = ['owner', 'admin', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef'];

const schema = z.object({
  resolution_note: z.string().trim().max(2000).nullable().optional(),
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
      return NextResponse.json({ error: 'Only action commitments can be resolved' }, { status: 400 });
    }
    assertVenueAccess(signal.venue_id, venueIds);

    const updated = await resolveCommitmentAction(signalId, user.id, body.resolution_note ?? null);

    if (!updated) {
      return NextResponse.json({ error: 'Failed to resolve commitment' }, { status: 500 });
    }

    const { data: refreshed } = await (supabase as any)
      .from('attestation_signals')
      .select('*')
      .eq('id', signalId)
      .single();

    return NextResponse.json({ success: true, data: refreshed });
  });
}
