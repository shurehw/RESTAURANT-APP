// POST /api/attestation/[id]/submit  — submit & lock attestation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { submitAttestationSchema } from '@/lib/attestation/types';
import type { TriggerResult } from '@/lib/attestation/types';
import { generateAttestationActions } from '@/lib/attestation/control-plane';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const { id } = await ctx.params;
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const supabase = await createClient();

    // Fetch attestation
    const { data: attestation, error: fetchError } = await supabase
      .from('nightly_attestations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !attestation) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Attestation not found' };
    }

    assertVenueAccess(attestation.venue_id, venueIds);

    const body = await req.json().catch(() => ({}));
    const { amendment_reason } = submitAttestationSchema.parse(body);

    const isAmendment = attestation.status === 'submitted';

    if (isAmendment && !amendment_reason) {
      throw {
        status: 400,
        code: 'AMENDMENT_REASON_REQUIRED',
        message: 'Amendment reason is required when modifying a submitted attestation',
      };
    }

    // Validate completeness: required triggers must be attested
    const triggers: TriggerResult | null = attestation.triggers_snapshot;
    if (triggers) {
      if (triggers.revenue_attestation_required && attestation.revenue_confirmed === null) {
        throw {
          status: 400,
          code: 'INCOMPLETE',
          message: 'Revenue attestation is required but not completed',
        };
      }
      if (triggers.labor_attestation_required && attestation.labor_confirmed === null) {
        throw {
          status: 400,
          code: 'INCOMPLETE',
          message: 'Labor attestation is required but not completed',
        };
      }
      if (triggers.comp_resolution_required) {
        const { data: resolutions } = await supabase
          .from('comp_resolutions')
          .select('id')
          .eq('attestation_id', id);

        const flaggedCount = triggers.flagged_comps?.length || 0;
        const resolvedCount = resolutions?.length || 0;
        if (resolvedCount < flaggedCount) {
          throw {
            status: 400,
            code: 'INCOMPLETE',
            message: `${flaggedCount - resolvedCount} comp(s) still need resolution`,
          };
        }
      }
    }

    // Submit / amend
    const now = new Date().toISOString();
    const updatePayload = isAmendment
      ? {
          status: 'amended' as const,
          amendment_reason,
          amended_at: now,
          amended_by: user.id,
        }
      : {
          status: 'submitted' as const,
          submitted_by: user.id,
          submitted_at: now,
          locked_at: now,
          locked_by: user.id,
        };

    const { data: updated, error: updateError } = await supabase
      .from('nightly_attestations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Generate control plane actions (non-blocking — don't fail submission)
    let actionResult: { success: boolean; actionsCreated: number; errors?: string[] } = { success: true, actionsCreated: 0 };
    try {
      // Fetch children for control plane
      const [compRes, incidents, coaching] = await Promise.all([
        supabase.from('comp_resolutions').select('*').eq('attestation_id', id),
        supabase.from('nightly_incidents').select('*').eq('attestation_id', id),
        supabase.from('coaching_actions').select('*').eq('attestation_id', id),
      ]);

      // Get venue name
      const { data: venue } = await supabase
        .from('venues')
        .select('name')
        .eq('id', attestation.venue_id)
        .single();

      actionResult = await generateAttestationActions({
        attestation: updated,
        compResolutions: compRes.data || [],
        incidents: incidents.data || [],
        coachingActions: coaching.data || [],
        triggers: triggers || {
          revenue_attestation_required: false,
          revenue_triggers: [],
          comp_resolution_required: false,
          flagged_comps: [],
          labor_attestation_required: false,
          labor_triggers: [],
          incident_log_required: false,
          incident_triggers: [],
        },
        venueName: venue?.name || '',
      });
    } catch (err) {
      console.error('[Attestation] Control plane action generation failed:', err);
    }

    return NextResponse.json({
      success: true,
      data: updated,
      actions_created: actionResult.actionsCreated,
      action_errors: actionResult.errors,
    });
  });
}
