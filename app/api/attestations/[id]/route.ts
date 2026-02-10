/**
 * Attestation Detail API
 * Returns full attestation data with children for drill-down drawer
 *
 * GET /api/attestations/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: attestationId } = await params;
  const supabase = getServiceClient();

  try {
    // Fetch attestation with venue info
    const { data: attestation, error: attestationError } = await (supabase as any)
      .from('nightly_attestations')
      .select(`
        *,
        venues!inner(id, name)
      `)
      .eq('id', attestationId)
      .single();

    if (attestationError) throw attestationError;
    if (!attestation) {
      return NextResponse.json(
        { error: 'Attestation not found' },
        { status: 404 }
      );
    }

    // Fetch comp resolutions
    const { data: compResolutions } = await (supabase as any)
      .from('comp_resolutions')
      .select('*')
      .eq('attestation_id', attestationId)
      .order('created_at', { ascending: false });

    // Fetch incidents
    const { data: incidents } = await (supabase as any)
      .from('nightly_incidents')
      .select('*')
      .eq('attestation_id', attestationId)
      .order('severity', { ascending: false });

    // Fetch coaching actions
    const { data: coachingActions } = await (supabase as any)
      .from('coaching_actions')
      .select('*')
      .eq('attestation_id', attestationId)
      .order('created_at', { ascending: false });

    // Fetch user who submitted (if submitted)
    let submittedByUser = null;
    if (attestation.submitted_by) {
      const { data: userData } = await (supabase as any)
        .from('users')
        .select('first_name, last_name, email')
        .eq('id', attestation.submitted_by)
        .maybeSingle();
      submittedByUser = userData;
    }

    return NextResponse.json({
      success: true,
      data: {
        attestation: {
          ...attestation,
          venue_name: attestation.venues?.name || 'Unknown',
          submitted_by_user: submittedByUser,
        },
        comp_resolutions: compResolutions || [],
        incidents: incidents || [],
        coaching_actions: coachingActions || [],
      },
    });

  } catch (error: any) {
    console.error('Attestation detail API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch attestation details' },
      { status: 500 }
    );
  }
}
