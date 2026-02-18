/**
 * AI Attestation Narrative API
 * POST /api/ai/attestation-narrative
 *
 * Generates revenue + labor narratives for the nightly attestation stepper.
 * Caching: sha256(input) → 24h TTL in Supabase (same pattern as comp-review).
 */

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { generateAttestationNarratives, type AttestationNarrativeInput } from '@/lib/ai/attestation-narrator';
import { getServiceClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { venue_id, date, venue_name } = body;

    if (!venue_id || !date) {
      return NextResponse.json(
        { error: 'venue_id and date are required' },
        { status: 400 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI narratives not configured (missing ANTHROPIC_API_KEY)' },
        { status: 503 },
      );
    }

    const input: AttestationNarrativeInput = {
      date,
      venueName: venue_name || 'Unknown Venue',
      net_sales: body.net_sales ?? 0,
      total_covers: body.total_covers ?? 0,
      total_comps: body.total_comps ?? 0,
      avg_check: body.avg_check ?? 0,
      food_sales: body.food_sales ?? 0,
      beverage_sales: body.beverage_sales ?? 0,
      beverage_pct: body.beverage_pct ?? 0,
      comp_pct: body.comp_pct ?? 0,
      forecast_net_sales: body.forecast_net_sales ?? null,
      forecast_covers: body.forecast_covers ?? null,
      vs_forecast_pct: body.vs_forecast_pct ?? null,
      vs_sdlw_pct: body.vs_sdlw_pct ?? null,
      vs_sdly_pct: body.vs_sdly_pct ?? null,
      labor_cost: body.labor_cost ?? 0,
      labor_pct: body.labor_pct ?? 0,
      splh: body.splh ?? 0,
      ot_hours: body.ot_hours ?? 0,
      total_labor_hours: body.total_labor_hours ?? 0,
      employee_count: body.employee_count ?? 0,
      covers_per_labor_hour: body.covers_per_labor_hour ?? null,
      foh_hours: body.foh_hours ?? null,
      foh_cost: body.foh_cost ?? null,
      boh_hours: body.boh_hours ?? null,
      boh_cost: body.boh_cost ?? null,
      comp_exception_count: body.comp_exception_count ?? 0,
      comp_pct_status: body.comp_pct_status ?? 'ok',
      health_score: body.health_score ?? null,
    };

    // Cache lookup
    const inputHash = computeHash(input);
    const supabase = getServiceClient();

    const cached = await getCached(supabase, venue_id, date, inputHash);
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true });
    }

    // Generate narratives
    const result = await generateAttestationNarratives(input);

    // Cache result (non-blocking)
    setCached(supabase, venue_id, date, inputHash, result).catch(err =>
      console.error('[attestation-narrative] Cache write failed:', err),
    );

    return NextResponse.json({ success: true, data: result, cached: false });
  } catch (error: any) {
    console.error('[attestation-narrative] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Cache helpers (mirrors comp-review pattern)
// ---------------------------------------------------------------------------

function computeHash(input: AttestationNarrativeInput): string {
  const payload = {
    date: input.date,
    net_sales: Math.round(input.net_sales),
    total_covers: input.total_covers,
    total_comps: Math.round(input.total_comps),
    labor_cost: Math.round(input.labor_cost),
    labor_pct: Math.round(input.labor_pct * 10),
    splh: Math.round(input.splh),
    ot_hours: Math.round(input.ot_hours * 10),
    vs_forecast_pct: input.vs_forecast_pct != null ? Math.round(input.vs_forecast_pct * 10) : null,
    comp_pct_status: input.comp_pct_status,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function getCached(supabase: any, venueId: string, date: string, inputHash: string) {
  try {
    const { data } = await supabase
      .from('ai_attestation_narrative_cache')
      .select('result')
      .eq('venue_id', venueId)
      .eq('business_date', date)
      .eq('input_hash', inputHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    return data?.result || null;
  } catch {
    return null;
  }
}

async function setCached(supabase: any, venueId: string, date: string, inputHash: string, result: any) {
  await supabase
    .from('ai_attestation_narrative_cache')
    .upsert({
      venue_id: venueId,
      business_date: date,
      input_hash: inputHash,
      result,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'venue_id,business_date,input_hash' });
}
