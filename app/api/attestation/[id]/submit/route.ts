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

    // Validate completeness: all modules must be attested
    // Narrative-first: notes >= 10 chars OR acknowledged
    const triggers: TriggerResult | null = attestation.triggers_snapshot;

    // Revenue: all 6 structured prompts must meet minimum length
    const revenuePromptKeys = [
      'revenue_driver', 'revenue_mgmt_impact', 'revenue_lost_opportunity',
      'revenue_demand_signal', 'revenue_quality', 'revenue_action',
    ] as const;
    const MIN_REVENUE_LEN = 20;
    const incompleteRevenue = revenuePromptKeys.filter(
      (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
    );
    if (incompleteRevenue.length > 0) {
      return NextResponse.json(
        { error: `Revenue module incomplete — ${incompleteRevenue.length} prompt(s) need at least ${MIN_REVENUE_LEN} characters each` },
        { status: 400 },
      );
    }

    // Comps: structured prompt OR acknowledged
    const compPromptKeys = ['comp_driver'] as const;
    const incompleteComps = compPromptKeys.filter(
      (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
    );
    if (incompleteComps.length > 0 && !attestation.comp_acknowledged) {
      return NextResponse.json(
        { error: `Comps module incomplete — answer the comp prompt (${MIN_REVENUE_LEN}+ chars) or acknowledge nothing to report` },
        { status: 400 },
      );
    }

    // Labor: all 3 structured prompts OR acknowledged
    const laborPromptKeys = ['labor_foh_coverage', 'labor_boh_performance', 'labor_decision'] as const;
    const incompleteLabor = laborPromptKeys.filter(
      (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
    );
    if (incompleteLabor.length > 0 && !attestation.labor_acknowledged) {
      return NextResponse.json(
        { error: `Labor module incomplete — answer all 3 prompts (${MIN_REVENUE_LEN}+ chars each) or acknowledge nothing to report` },
        { status: 400 },
      );
    }

    // Comps: if flagged, require resolutions
    if (triggers?.comp_resolution_required) {
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

    // Incidents: must have notes OR acknowledged
    if (!((attestation.incident_notes?.length ?? 0) >= 10) && !attestation.incidents_acknowledged) {
      return NextResponse.json(
        { error: 'Incidents module is required — describe incidents or acknowledge nothing to report' },
        { status: 400 },
      );
    }

    // Coaching: all 5 structured prompts (FOH + BOH + team focus) OR acknowledged
    const coachingPromptKeys = [
      'coaching_foh_standout', 'coaching_foh_development',
      'coaching_boh_standout', 'coaching_boh_development',
      'coaching_team_focus',
    ] as const;
    const incompleteCoaching = coachingPromptKeys.filter(
      (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
    );
    if (incompleteCoaching.length > 0 && !attestation.coaching_acknowledged) {
      return NextResponse.json(
        { error: `Coaching module incomplete — answer all 5 prompts (${MIN_REVENUE_LEN}+ chars each) or acknowledge nothing to report` },
        { status: 400 },
      );
    }

    // Guest: all 3 structured prompts OR acknowledged
    const guestPromptKeys = ['guest_vip_notable', 'guest_experience', 'guest_opportunity'] as const;
    const incompleteGuest = guestPromptKeys.filter(
      (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
    );
    if (incompleteGuest.length > 0 && !attestation.guest_acknowledged) {
      return NextResponse.json(
        { error: `Guest module incomplete — answer all 3 prompts (${MIN_REVENUE_LEN}+ chars each) or acknowledge nothing to report` },
        { status: 400 },
      );
    }

    // Closing narrative: required
    if (!attestation.closing_narrative) {
      return NextResponse.json(
        { error: 'Closing summary is required — generate it on the Review step before submitting' },
        { status: 400 },
      );
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
