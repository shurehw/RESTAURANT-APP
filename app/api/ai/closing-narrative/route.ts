/**
 * AI Closing Narrative API
 * POST /api/ai/closing-narrative
 *
 * Generates a unified closing summary incorporating raw data + manager inputs.
 * Not cached — manager inputs change as they work through the attestation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateClosingNarrative, type ClosingNarrativeInput } from '@/lib/ai/closing-narrator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.date || !body.venueName) {
      return NextResponse.json(
        { error: 'date and venueName are required' },
        { status: 400 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI not configured (missing ANTHROPIC_API_KEY)' },
        { status: 503 },
      );
    }

    const input: ClosingNarrativeInput = {
      date: body.date,
      venueName: body.venueName,
      // Raw data
      net_sales: body.net_sales ?? 0,
      total_covers: body.total_covers ?? 0,
      avg_check: body.avg_check ?? 0,
      food_sales: body.food_sales ?? 0,
      beverage_sales: body.beverage_sales ?? 0,
      beverage_pct: body.beverage_pct ?? 0,
      forecast_net_sales: body.forecast_net_sales ?? null,
      vs_forecast_pct: body.vs_forecast_pct ?? null,
      vs_sdlw_pct: body.vs_sdlw_pct ?? null,
      vs_sdly_pct: body.vs_sdly_pct ?? null,
      labor_cost: body.labor_cost ?? 0,
      labor_pct: body.labor_pct ?? 0,
      splh: body.splh ?? 0,
      ot_hours: body.ot_hours ?? 0,
      total_labor_hours: body.total_labor_hours ?? 0,
      employee_count: body.employee_count ?? 0,
      total_comps: body.total_comps ?? 0,
      comp_pct: body.comp_pct ?? 0,
      comp_exception_count: body.comp_exception_count ?? 0,
      health_score: body.health_score ?? null,
      // Manager inputs — revenue (structured prompts)
      revenue_driver: body.revenue_driver ?? null,
      revenue_mgmt_impact: body.revenue_mgmt_impact ?? null,
      revenue_lost_opportunity: body.revenue_lost_opportunity ?? null,
      revenue_demand_signal: body.revenue_demand_signal ?? null,
      revenue_quality: body.revenue_quality ?? null,
      revenue_action: body.revenue_action ?? null,
      revenue_tags: body.revenue_tags ?? [],
      revenue_notes: body.revenue_notes ?? null,
      // Comp structured prompts
      comp_driver: body.comp_driver ?? null,
      comp_pattern: body.comp_pattern ?? null,
      comp_compliance: body.comp_compliance ?? null,
      comp_tags: body.comp_tags ?? [],
      comp_notes: body.comp_notes ?? null,
      comp_acknowledged: body.comp_acknowledged ?? false,
      // Labor structured prompts
      labor_foh_coverage: body.labor_foh_coverage ?? null,
      labor_boh_performance: body.labor_boh_performance ?? null,
      labor_decision: body.labor_decision ?? null,
      labor_change: body.labor_change ?? null,
      labor_tags: body.labor_tags ?? [],
      labor_notes: body.labor_notes ?? null,
      labor_foh_notes: body.labor_foh_notes ?? null,
      labor_boh_notes: body.labor_boh_notes ?? null,
      labor_acknowledged: body.labor_acknowledged ?? false,
      comp_resolutions: body.comp_resolutions ?? [],
      incident_tags: body.incident_tags ?? [],
      incident_notes: body.incident_notes ?? null,
      incidents_acknowledged: body.incidents_acknowledged ?? false,
      incidents: body.incidents ?? [],
      // Coaching structured prompts (FOH + BOH + shared)
      coaching_foh_standout: body.coaching_foh_standout ?? null,
      coaching_foh_development: body.coaching_foh_development ?? null,
      coaching_boh_standout: body.coaching_boh_standout ?? null,
      coaching_boh_development: body.coaching_boh_development ?? null,
      coaching_team_focus: body.coaching_team_focus ?? null,
      coaching_tags: body.coaching_tags ?? [],
      coaching_notes: body.coaching_notes ?? null,
      coaching_acknowledged: body.coaching_acknowledged ?? false,
      coaching_actions: body.coaching_actions ?? [],
      top_spenders: body.top_spenders ?? [],
      known_vips: body.known_vips ?? [],
      // Guest structured prompts
      guest_vip_notable: body.guest_vip_notable ?? null,
      guest_experience: body.guest_experience ?? null,
      guest_opportunity: body.guest_opportunity ?? null,
      guest_tags: body.guest_tags ?? [],
      guest_notes: body.guest_notes ?? null,
      guest_acknowledged: body.guest_acknowledged ?? false,
      entertainment_tags: body.entertainment_tags ?? [],
      entertainment_notes: body.entertainment_notes ?? null,
      culinary_tags: body.culinary_tags ?? [],
      culinary_notes: body.culinary_notes ?? null,
      trigger_reasons: body.trigger_reasons ?? [],
    };

    const narrative = await generateClosingNarrative(input);

    return NextResponse.json({ success: true, narrative });
  } catch (error: any) {
    console.error('[closing-narrative] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
