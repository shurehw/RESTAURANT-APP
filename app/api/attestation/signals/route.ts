/**
 * Attestation Signals API
 *
 * GET /api/attestation/signals?attestation_id=...
 *   Returns all extracted signals for a specific attestation.
 *   Safe for managers — these are structured extractions from their own text.
 *
 * Prior night context (commitments, patterns) is now in the operator
 * intelligence system — see /api/operator/intelligence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import { getSignalsForAttestation } from '@/lib/database/signal-outcomes';

export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { searchParams } = new URL(request.url);

    const attestationId = searchParams.get('attestation_id');
    if (!attestationId) {
      return NextResponse.json(
        { error: 'attestation_id is required' },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();
    const { data: attestation } = await (supabase as any)
      .from('nightly_attestations')
      .select('venue_id')
      .eq('id', attestationId)
      .single();

    if (!attestation) {
      return NextResponse.json({ error: 'Attestation not found' }, { status: 404 });
    }
    assertVenueAccess(attestation.venue_id, venueIds);

    const signals = await getSignalsForAttestation(attestationId);
    return NextResponse.json({ success: true, signals });
  });
}
