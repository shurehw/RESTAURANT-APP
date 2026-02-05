/**
 * Entertainment Shift Logs API
 * Manager feedback on nightly entertainment performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveContext } from '@/lib/auth/resolveContext';

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx || !ctx.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const businessDate = searchParams.get('business_date');

    const adminClient = createAdminClient();

    let query = (adminClient as any)
      .from('entertainment_shift_logs')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .order('business_date', { ascending: false });

    if (venueId) {
      query = query.eq('venue_id', venueId);
    }

    if (businessDate) {
      query = query.eq('business_date', businessDate);
    } else {
      if (startDate) {
        query = query.gte('business_date', startDate);
      }
      if (endDate) {
        query = query.lte('business_date', endDate);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching shift logs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('Shift logs API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx || !ctx.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      venue_id,
      business_date,
      overall_rating,
      crowd_energy,
      entertainment_feedback,
      would_rebook,
      type_feedback,
      total_entertainment_cost,
      actual_sales,
    } = body;

    if (!venue_id || !business_date) {
      return NextResponse.json(
        { error: 'venue_id and business_date are required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Get venue's organization_id
    const { data: venue } = await adminClient
      .from('venues')
      .select('organization_id')
      .eq('id', venue_id)
      .single();

    const organizationId = venue?.organization_id || ctx.orgId;

    // Calculate entertainment percentage
    const entertainment_pct = actual_sales && total_entertainment_cost
      ? (total_entertainment_cost / actual_sales) * 100
      : null;

    // Upsert (insert or update on conflict)
    const { data, error } = await (adminClient as any)
      .from('entertainment_shift_logs')
      .upsert({
        organization_id: organizationId,
        venue_id,
        business_date,
        overall_rating: overall_rating || null,
        crowd_energy: crowd_energy || null,
        entertainment_feedback: entertainment_feedback || null,
        would_rebook: would_rebook ?? null,
        type_feedback: type_feedback || {},
        total_entertainment_cost: total_entertainment_cost || null,
        actual_sales: actual_sales || null,
        entertainment_pct: entertainment_pct || null,
        submitted_by: ctx.authUserId,
        submitted_at: new Date().toISOString(),
      }, {
        onConflict: 'venue_id,business_date',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating shift log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Shift logs API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx || !ctx.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Shift log ID is required' }, { status: 400 });
    }

    // Recalculate entertainment percentage if sales/cost updated
    if (updates.actual_sales && updates.total_entertainment_cost) {
      updates.entertainment_pct = (updates.total_entertainment_cost / updates.actual_sales) * 100;
    }

    const adminClient = createAdminClient();

    const { data, error } = await (adminClient as any)
      .from('entertainment_shift_logs')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', ctx.orgId)
      .select()
      .single();

    if (error) {
      console.error('Error updating shift log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Shift logs API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
