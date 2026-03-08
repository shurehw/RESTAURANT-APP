// POST /api/attestation/[id]/submit  â€” submit & lock attestation

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import { submitAttestationSchema } from '@/lib/attestation/types';
import type { TriggerResult } from '@/lib/attestation/types';
import { generateAttestationActions } from '@/lib/attestation/control-plane';
import { extractAndStoreSignals, type SignalExtractionInput } from '@/lib/ai/signal-extractor';
import { generateIntelligence } from '@/lib/database/operator-intelligence';

type RouteContext = { params: Promise<{ id: string }> };
const MIN_REVENUE_LEN = 20;
const MIN_NOTE_LEN = 10;
const hasColumn = (obj: Record<string, any>, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const longEnough = (value: unknown, min: number) => typeof value === 'string' && value.trim().length >= min;

export async function POST(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef']);
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
    assertVenueAccess(attestation.venue_id, venueIds);

    const body = await req.json().catch(() => ({}));
    const { amendment_reason } = submitAttestationSchema.parse(body);

    const isAmendment = attestation.status === 'submitted' || attestation.status === 'amended';

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
    const hasStructuredRevenue = hasColumn(attestation, 'revenue_driver');
    if (hasStructuredRevenue) {
      const incompleteRevenue = revenuePromptKeys.filter(
        (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
      );
      if (incompleteRevenue.length > 0) {
        return NextResponse.json(
          { error: `Revenue module incomplete - ${incompleteRevenue.length} prompt(s) need at least ${MIN_REVENUE_LEN} characters each` },
          { status: 400 },
        );
      }
    } else if (!longEnough(attestation.revenue_notes, MIN_REVENUE_LEN)) {
      return NextResponse.json(
        { error: `Revenue module incomplete - provide at least ${MIN_REVENUE_LEN} characters` },
        { status: 400 },
      );
    }

    // Comps: structured prompt OR acknowledged
    const compPromptKeys = ['comp_driver'] as const;
    const hasStructuredComps = hasColumn(attestation, 'comp_driver');
    if (hasStructuredComps) {
      const incompleteComps = compPromptKeys.filter(
        (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
      );
      if (incompleteComps.length > 0 && !attestation.comp_acknowledged) {
        return NextResponse.json(
          { error: `Comps module incomplete - answer the comp prompt (${MIN_REVENUE_LEN}+ chars) or acknowledge nothing to report` },
          { status: 400 },
        );
      }
    } else if (hasColumn(attestation, 'comp_notes') && !longEnough(attestation.comp_notes, MIN_NOTE_LEN)) {
      return NextResponse.json(
        { error: 'Comps module incomplete - provide comp notes' },
        { status: 400 },
      );
    }

    // FOH: both prompts OR acknowledged (fallback to legacy labor_acknowledged)
    const fohPromptKeys = ['labor_foh_coverage', 'foh_staffing_decision'] as const;
    const hasStructuredFoh = hasColumn(attestation, 'labor_foh_coverage') || hasColumn(attestation, 'foh_staffing_decision');
    if (hasStructuredFoh) {
      const incompleteFoh = fohPromptKeys.filter(
        (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
      );
      if (incompleteFoh.length > 0 && !attestation.foh_acknowledged && !attestation.labor_acknowledged) {
        return NextResponse.json(
          { error: `FOH module incomplete - answer both prompts (${MIN_REVENUE_LEN}+ chars each) or acknowledge nothing to report` },
          { status: 400 },
        );
      }
    } else if (!longEnough(attestation.labor_notes, MIN_NOTE_LEN) && !attestation.labor_acknowledged) {
      return NextResponse.json(
        { error: 'Labor module incomplete - provide labor notes or acknowledge nothing to report' },
        { status: 400 },
      );
    }

    // BOH: both prompts OR acknowledged (fallback to legacy labor_acknowledged)
    const bohPromptKeys = ['labor_boh_performance', 'boh_staffing_decision'] as const;
    const hasStructuredBoh = hasColumn(attestation, 'labor_boh_performance') || hasColumn(attestation, 'boh_staffing_decision');
    if (hasStructuredBoh) {
      const incompleteBoh = bohPromptKeys.filter(
        (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
      );
      if (incompleteBoh.length > 0 && !attestation.boh_acknowledged && !attestation.labor_acknowledged) {
        return NextResponse.json(
          { error: `BOH module incomplete - answer both prompts (${MIN_REVENUE_LEN}+ chars each) or acknowledge nothing to report` },
          { status: 400 },
        );
      }
    }

    // Comps: if flagged, require resolutions (exclude BOH-only stubs)
    if (triggers?.comp_resolution_required) {
      const { data: resolutions } = await (supabase as any)
        .from('comp_resolutions')
        .select('id, resolution_code')
        .eq('attestation_id', id);

      const flaggedCount = triggers.flagged_comps?.length || 0;
      const resolvedCount = (resolutions || []).filter(
        (r: any) => r.resolution_code !== 'pending_foh_resolution',
      ).length;
      if (resolvedCount < flaggedCount) {
        return NextResponse.json(
          { error: `${flaggedCount - resolvedCount} comp(s) still need resolution` },
          { status: 400 },
        );
      }
    }

    // Incidents: must have notes OR acknowledged
    const hasIncidentNotes = hasColumn(attestation, 'incident_notes');
    const hasIncidentAck = hasColumn(attestation, 'incidents_acknowledged');
    if (hasIncidentNotes || hasIncidentAck) {
      if (!((attestation.incident_notes?.length ?? 0) >= MIN_NOTE_LEN) && !attestation.incidents_acknowledged) {
        return NextResponse.json(
          { error: 'Incidents module is required - describe incidents or acknowledge nothing to report' },
          { status: 400 },
        );
      }
    }

    // Coaching: all 5 structured prompts (FOH + BOH + team focus) OR acknowledged
    const coachingPromptKeys = [
      'coaching_foh_standout', 'coaching_foh_development',
      'coaching_boh_standout', 'coaching_boh_development',
      'coaching_team_focus',
    ] as const;
    const hasStructuredCoaching = hasColumn(attestation, 'coaching_foh_standout');
    if (hasStructuredCoaching) {
      const incompleteCoaching = coachingPromptKeys.filter(
        (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
      );
      if (incompleteCoaching.length > 0 && !attestation.coaching_acknowledged) {
        return NextResponse.json(
          { error: `Coaching module incomplete - answer all 5 prompts (${MIN_REVENUE_LEN}+ chars each) or acknowledge nothing to report` },
          { status: 400 },
        );
      }
    } else if (hasColumn(attestation, 'coaching_notes') && !longEnough(attestation.coaching_notes, MIN_NOTE_LEN)) {
      return NextResponse.json(
        { error: 'Coaching module incomplete - provide coaching notes' },
        { status: 400 },
      );
    }

    // Guest: all 3 structured prompts OR acknowledged
    const guestPromptKeys = ['guest_vip_notable', 'guest_experience', 'guest_opportunity'] as const;
    const hasStructuredGuest = hasColumn(attestation, 'guest_vip_notable');
    if (hasStructuredGuest) {
      const incompleteGuest = guestPromptKeys.filter(
        (k) => !((attestation[k]?.length ?? 0) >= MIN_REVENUE_LEN),
      );
      if (incompleteGuest.length > 0 && !attestation.guest_acknowledged) {
        return NextResponse.json(
          { error: `Guest module incomplete - answer all 3 prompts (${MIN_REVENUE_LEN}+ chars each) or acknowledge nothing to report` },
          { status: 400 },
        );
      }
    } else if (!longEnough(attestation.guest_notes, MIN_NOTE_LEN)) {
      return NextResponse.json(
        { error: 'Guest module incomplete - provide guest notes' },
        { status: 400 },
      );
    }

    // Closing narrative: required
    if (hasColumn(attestation, 'closing_narrative') && !attestation.closing_narrative) {
      return NextResponse.json(
        { error: 'Closing summary is required - generate it on the Review step before submitting' },
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
          amended_by: user.id,
        }
      : {
          status: 'submitted' as const,
          submitted_at: now,
          submitted_by: user.id,
          locked_at: now,
          locked_by: user.id,
        };

    const { data: updated, error: updateError } = await (supabase as any)
      .from('nightly_attestations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Generate control plane actions (non-blocking â€” don't fail submission)
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

    // Signal extraction â€” AI-powered entity extraction from free-text (non-blocking)
    let signalResult: { extracted: number; stored: number; errors: string[]; ownership: import('@/lib/ai/signal-extractor').OwnershipScores | null } = { extracted: 0, stored: 0, errors: [], ownership: null };
    try {
      // Build field map from attestation text columns
      const textFields: Record<string, string | null> = {};
      const textFieldNames = [
        'revenue_driver', 'revenue_mgmt_impact', 'revenue_lost_opportunity',
        'revenue_demand_signal', 'revenue_quality', 'revenue_action', 'revenue_notes',
        'comp_driver', 'comp_pattern', 'comp_compliance', 'comp_notes',
        'labor_foh_coverage', 'labor_boh_performance', 'labor_decision',
        'foh_staffing_decision', 'boh_staffing_decision',
        'labor_change', 'labor_notes', 'labor_foh_notes', 'labor_boh_notes',
        'incident_notes',
        'coaching_foh_standout', 'coaching_foh_development',
        'coaching_boh_standout', 'coaching_boh_development',
        'coaching_team_focus', 'coaching_notes',
        'guest_vip_notable', 'guest_experience', 'guest_opportunity', 'guest_notes',
        'entertainment_notes', 'culinary_notes',
      ];
      for (const f of textFieldNames) {
        textFields[f] = attestation[f] ?? null;
      }

      const { data: venueForSignals } = await (supabase as any)
        .from('venues')
        .select('name')
        .eq('id', attestation.venue_id)
        .single();

      const signalInput: SignalExtractionInput = {
        attestation_id: id,
        venue_id: attestation.venue_id,
        business_date: attestation.business_date,
        venue_name: venueForSignals?.name || '',
        submitted_by: updated.submitted_by || attestation.submitted_by || user.id,
        fields: textFields,
      };

      signalResult = await extractAndStoreSignals(signalInput);

      // Operator intelligence â€” internal signals for owner/director only (non-blocking)
      try {
        const { data: venueWithOrg } = await (supabase as any)
          .from('venues')
          .select('organization_id')
          .eq('id', attestation.venue_id)
          .single();

        const { data: submitterProfile } = attestation.submitted_by
          ? await (supabase as any)
              .from('user_profiles')
              .select('full_name')
              .eq('id', attestation.submitted_by)
              .single()
          : { data: null };

        if (venueWithOrg?.organization_id) {
          await generateIntelligence({
            org_id: venueWithOrg.organization_id,
            venue_id: attestation.venue_id,
            venue_name: venueForSignals?.name || '',
            business_date: attestation.business_date,
            attestation_id: id,
            submitted_by: updated.submitted_by || attestation.submitted_by || user.id,
            submitted_by_name: submitterProfile?.full_name || undefined,
            ownership: signalResult.ownership ?? null,
          });
        }
      } catch (err) {
        console.error('[Attestation] Operator intelligence generation failed:', err);
      }
    } catch (err) {
      console.error('[Attestation] Signal extraction failed:', err);
    }

    return NextResponse.json({
      success: true,
      data: updated,
      actions_created: actionResult.actionsCreated,
      action_errors: actionResult.errors,
      signals_extracted: signalResult.extracted,
      signals_stored: signalResult.stored,
    });
  });
}
