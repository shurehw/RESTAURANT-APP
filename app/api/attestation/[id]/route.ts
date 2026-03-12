// GET /api/attestation/[id]  — get single attestation with children
// PUT /api/attestation/[id]  — update attestation fields (draft only)

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import { updateAttestationSchema } from '@/lib/attestation/types';

type RouteContext = { params: Promise<{ id: string }> };
const STRUCTURED_OPTIONAL_FIELDS = new Set([
  'revenue_driver', 'revenue_mgmt_impact', 'revenue_lost_opportunity', 'revenue_demand_signal', 'revenue_quality', 'revenue_action',
  'comp_driver', 'comp_pattern', 'comp_compliance',
  'labor_foh_coverage', 'labor_boh_performance', 'labor_decision', 'labor_change',
  'foh_staffing_decision', 'boh_staffing_decision',
  'coaching_foh_standout', 'coaching_foh_development', 'coaching_boh_standout', 'coaching_boh_development', 'coaching_team_focus',
  'guest_vip_notable', 'guest_experience', 'guest_opportunity',
  'comp_acknowledged', 'incidents_acknowledged', 'coaching_acknowledged', 'foh_acknowledged', 'boh_acknowledged',
  'closing_narrative',
]);

function extractMissingColumn(error: any): string | null {
  if (!error) return null;
  const text = [error.message, error.details, error.hint, error.error].filter(Boolean).join(' ');
  const m = text.match(/Could not find the '([^']+)' column/i)
    || text.match(/'([^']+)' column of 'nightly_attestations'/i)
    || text.match(/column nightly_attestations\.([a-zA-Z0-9_]+) does not exist/i);
  return m?.[1] ?? null;
}

function mergeLegacyNarratives(updates: Record<string, any>): Record<string, any> {
  const next = { ...updates };
  const joinText = (...parts: Array<string | null | undefined>) =>
    parts.filter((p) => typeof p === 'string' && p.trim().length > 0).join('\n\n');

  if (!next.revenue_notes) {
    next.revenue_notes = joinText(
      next.revenue_driver,
      next.revenue_mgmt_impact,
      next.revenue_lost_opportunity,
      next.revenue_demand_signal,
      next.revenue_quality,
      next.revenue_action,
    ) || undefined;
  }
  if (!next.comp_notes) {
    next.comp_notes = joinText(next.comp_driver, next.comp_pattern, next.comp_compliance) || undefined;
  }
  if (!next.labor_notes) {
    next.labor_notes = joinText(
      next.labor_foh_coverage,
      next.foh_staffing_decision,
      next.labor_boh_performance,
      next.boh_staffing_decision,
      next.labor_decision,
      next.labor_change,
    ) || undefined;
  }
  if (!next.coaching_notes) {
    next.coaching_notes = joinText(
      next.coaching_foh_standout,
      next.coaching_foh_development,
      next.coaching_boh_standout,
      next.coaching_boh_development,
      next.coaching_team_focus,
    ) || undefined;
  }
  if (!next.guest_notes) {
    next.guest_notes = joinText(next.guest_vip_notable, next.guest_experience, next.guest_opportunity) || undefined;
  }

  return next;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { id } = await ctx.params;
    const supabase = getServiceClient();

    const { data: attestation, error } = await (supabase as any)
      .from('nightly_attestations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !attestation) {
      return NextResponse.json({ error: 'Attestation not found' }, { status: 404 });
    }
    assertVenueAccess(attestation.venue_id, venueIds);

    // Fetch children in parallel
    const [compRes, incidents, coaching] = await Promise.all([
      (supabase as any)
        .from('comp_resolutions')
        .select('*')
        .eq('attestation_id', id)
        .order('created_at', { ascending: true }),
      (supabase as any)
        .from('nightly_incidents')
        .select('*')
        .eq('attestation_id', id)
        .order('created_at', { ascending: true }),
      (supabase as any)
        .from('coaching_actions')
        .select('*')
        .eq('attestation_id', id)
        .order('created_at', { ascending: true }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        attestation,
        comp_resolutions: compRes.data || [],
        incidents: incidents.data || [],
        coaching_actions: coaching.data || [],
      },
    });
  });
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef', 'onboarding', 'readonly', 'viewer']);
    const { id } = await ctx.params;
    const supabase = getServiceClient();

    // Verify attestation exists and is editable
    const { data: existing, error: fetchError } = await (supabase as any)
      .from('nightly_attestations')
      .select('id, venue_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Attestation not found' }, { status: 404 });
    }
    assertVenueAccess(existing.venue_id, venueIds);

    if (existing.status === 'submitted') {
      return NextResponse.json(
        { error: 'Cannot edit a submitted attestation. Use amendment flow.' },
        { status: 409 },
      );
    }

    const body = await req.json();
    let updates = mergeLegacyNarratives(updateAttestationSchema.parse(body));
    let data: any = null;
    let error: any = null;

    // Backward compatibility: drop unknown columns one-by-one for older schemas.
    for (let i = 0; i < 30; i++) {
      // If all fields were stripped, nothing to update — return existing row
      if (Object.keys(updates).length === 0) {
        data = existing;
        error = null;
        break;
      }

      const result = await (supabase as any)
        .from('nightly_attestations')
        .update(updates)
        .eq('id', id)
        .select();

      data = result.data?.[0] ?? null;
      error = result.error;
      if (!error) {
        // 0 rows from empty/no-op update is fine — return existing row
        if (!data) data = existing;
        break;
      }

      const missing = extractMissingColumn(error);
      if (missing) {
        const { [missing]: _ignored, ...rest } = updates as Record<string, any>;
        // If parser found a column that is not in this payload, fall back to structured field stripping.
        if (Object.keys(rest).length < Object.keys(updates).length) {
          updates = rest;
          continue;
        }
      }

      const msg = String(error.message || '');
      if (error.code === 'PGRST204' || msg.includes('schema cache') || msg.includes('does not exist')) {
        const entries = Object.entries(updates).filter(([key]) => !STRUCTURED_OPTIONAL_FIELDS.has(key));
        if (entries.length < Object.keys(updates).length) {
          updates = Object.fromEntries(entries);
          continue;
        }
      }
      break;
    }

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  });
}
