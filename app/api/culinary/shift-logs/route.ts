/**
 * Culinary Shift Logs API
 * Chef/BOH nightly kitchen performance log
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
    const businessDate = searchParams.get('business_date');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const adminClient = createAdminClient();

    let query = (adminClient as any)
      .from('culinary_shift_logs')
      .select('*')
      .eq('organization_id', ctx.orgId ?? '')
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
      console.error('Error fetching culinary logs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('Culinary logs API error:', error);
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
      eightysixed_items,
      specials_notes,
      equipment_issues,
      prep_notes,
      waste_notes,
      vendor_issues,
      overall_rating,
      general_notes,
    } = body;

    if (!venue_id || !business_date) {
      return NextResponse.json(
        { error: 'venue_id and business_date are required' },
        { status: 400 },
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

    // Upsert (insert or update on conflict)
    const { data, error } = await (adminClient as any)
      .from('culinary_shift_logs')
      .upsert(
        {
          organization_id: organizationId,
          venue_id,
          business_date,
          eightysixed_items: eightysixed_items || [],
          specials_notes: specials_notes || null,
          equipment_issues: equipment_issues || null,
          prep_notes: prep_notes || null,
          waste_notes: waste_notes || null,
          vendor_issues: vendor_issues || null,
          overall_rating: overall_rating || null,
          general_notes: general_notes || null,
          submitted_by: ctx.authUserId,
          submitted_at: new Date().toISOString(),
        },
        {
          onConflict: 'venue_id,business_date',
        },
      )
      .select()
      .single();

    if (error) {
      console.error('Error creating culinary log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Culinary logs API error:', error);
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
      return NextResponse.json(
        { error: 'Culinary log ID is required' },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    const { data, error } = await (adminClient as any)
      .from('culinary_shift_logs')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', ctx.orgId ?? '')
      .select()
      .single();

    if (error) {
      console.error('Error updating culinary log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Culinary logs API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
