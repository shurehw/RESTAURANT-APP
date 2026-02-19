// POST /api/attestation/[id]/submit  — submit & lock attestation

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { submitAttestationSchema } from '@/lib/attestation/types';
import type { TriggerResult } from '@/lib/attestation/types';
import { generateAttestationActions } from '@/lib/attestation/control-plane';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = getServiceClient();

    // Fetch attestation
    const { data: attestation, error: fetchError } = await (supabase as any)
      .from('nightly_attestations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !attestation) {
      return NextResponse.json({ error: 'Attestation not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { amendment_reason } = submitAttestationSchema.parse(body);

    const isAmendment = attestation.status === 'submitted';

    if (isAmendment && !amendment_reason) {
      return NextResponse.json(
        { error: 'Amendment reason is required when modifying a submitted attestation' },
        { status: 400 },
      );
    }

    // Validate completeness: required triggers must be attested
    const triggers: TriggerResult | null = attestation.triggers_snapshot;
    if (triggers) {
      if (triggers.revenue_attestation_required && attestation.revenue_confirmed === null) {
        return NextResponse.json(
          { error: 'Revenue attestation is required but not completed' },
          { status: 400 },
        );
      }
      if (triggers.labor_attestation_required && attestation.labor_confirmed === null) {
        return NextResponse.json(
          { error: 'Labor attestation is required but not completed' },
          { status: 400 },
        );
      }
      if (triggers.comp_resolution_required) {
        const { data: resolutions } = await (supabase as any)
          .from('comp_resolutions')
          .select('id')
          .eq('attestation_id', id);

        const flaggedCount = triggers.flagged_comps?.length || 0;
        const resolvedCount = resolutions?.length || 0;
        if (resolvedCount < flaggedCount) {
          return NextResponse.json(
            { error: `${flaggedCount - resolvedCount} comp(s) still need resolution` },
            { status: 400 },
          );
        }
      }
    }

    // Attestation gating: check for unresolved critical feedback objects
    {
      const { data: venue } = await (supabase as any)
        .from('venues')
        .select('organization_id')
        .eq('id', attestation.venue_id)
        .single();

      if (venue?.organization_id) {
        const { data: canSubmit } = await (supabase as any).rpc(
          'can_submit_attestation',
          {
            p_org_id: venue.organization_id,
            p_venue_id: attestation.venue_id,
            p_business_date: attestation.business_date,
          }
        );

        if (canSubmit === false) {
          return NextResponse.json(
            {
              error:
                'Attestation blocked: unresolved critical feedback items must be addressed before submission.',
              code: 'ATTESTATION_GATED',
            },
            { status: 422 }
          );
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
        }
      : {
          status: 'submitted' as const,
          submitted_at: now,
          locked_at: now,
        };

    const { data: updated, error: updateError } = await (supabase as any)
      .from('nightly_attestations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Generate control plane actions (non-blocking — don't fail submission)
    let actionResult: { success: boolean; actionsCreated: number; errors?: string[] } = { success: true, actionsCreated: 0 };
    try {
      const [compRes, incidents, coaching] = await Promise.all([
        (supabase as any).from('comp_resolutions').select('*').eq('attestation_id', id),
        (supabase as any).from('nightly_incidents').select('*').eq('attestation_id', id),
        (supabase as any).from('coaching_actions').select('*').eq('attestation_id', id),
      ]);

      const { data: venue } = await (supabase as any)
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
          entertainment_review_required: false,
          culinary_review_required: false,
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
  } catch (err: any) {
    console.error('[Attestation submit]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
