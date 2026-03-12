import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/cogs/menu-price-alerts
 * Query menu margin health or active alerts.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'health';
    const venueId = searchParams.get('venue_id') || (venueIds.length === 1 ? venueIds[0] : null);
    const supabase = getServiceClient();

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    if (mode === 'summary') {
      const { data } = await (supabase as any)
        .from('v_menu_margin_summary')
        .select('*')
        .eq('venue_id', venueId)
        .single();
      return NextResponse.json({ summary: data });
    }

    if (mode === 'alerts') {
      const { data } = await (supabase as any)
        .from('menu_price_alerts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('status', 'open')
        .order('severity', { ascending: true });
      return NextResponse.json({ alerts: data || [] });
    }

    // Default: full margin health
    const { data } = await (supabase as any)
      .from('v_menu_margin_health')
      .select('*')
      .eq('venue_id', venueId)
      .order('breach_pct', { ascending: false, nullsFirst: false });

    return NextResponse.json({ recipes: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/cogs/menu-price-alerts
 * Acknowledge or dismiss an alert.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const body = await req.json();
    const scoped = await createClient();
    const supabase = getServiceClient();
    const { data: alert } = await scoped
      .from('menu_price_alerts')
      .select('venue_id')
      .eq('id', body.alert_id)
      .single();
    if (!alert?.venue_id) {
      return NextResponse.json({ error: 'alert not found' }, { status: 404 });
    }
    assertVenueAccess(alert.venue_id, venueIds);

    const { error } = await (supabase as any)
      .from('menu_price_alerts')
      .update({
        status: body.status || 'acknowledged',
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString(),
        resolution_notes: body.notes,
      })
      .eq('id', body.alert_id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
