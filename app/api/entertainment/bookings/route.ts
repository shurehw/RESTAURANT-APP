/**
 * Entertainment Bookings API
 * CRUD operations for entertainment bookings
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

    const adminClient = createAdminClient();

    let query = adminClient
      .from('entertainment_bookings')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .order('booking_date', { ascending: true });

    if (venueId) {
      query = query.eq('venue_id', venueId);
    }

    if (startDate) {
      query = query.gte('booking_date', startDate);
    }

    if (endDate) {
      query = query.lte('booking_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching bookings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('Bookings API error:', error);
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
      booking_date,
      entertainment_type,
      artist_name,
      time_start,
      time_end,
      config,
      rate_amount,
      notes,
      status = 'confirmed',
    } = body;

    if (!booking_date || !entertainment_type) {
      return NextResponse.json(
        { error: 'Booking date and entertainment type are required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Get venue's organization_id if venue_id is provided
    let organizationId = ctx.orgId;
    if (venue_id) {
      const { data: venue } = await adminClient
        .from('venues')
        .select('organization_id')
        .eq('id', venue_id)
        .single();

      if (venue) {
        organizationId = venue.organization_id;
      }
    }

    const { data, error } = await adminClient
      .from('entertainment_bookings')
      .insert({
        organization_id: organizationId,
        venue_id: venue_id || null,
        booking_date,
        entertainment_type,
        artist_name: artist_name || null,
        time_start: time_start || null,
        time_end: time_end || null,
        config: config || null,
        rate_amount: rate_amount || null,
        notes: notes || null,
        status,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating booking:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Bookings API error:', error);
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
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from('entertainment_bookings')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', ctx.orgId)
      .select()
      .single();

    if (error) {
      console.error('Error updating booking:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Bookings API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx || !ctx.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('entertainment_bookings')
      .delete()
      .eq('id', id)
      .eq('organization_id', ctx.orgId);

    if (error) {
      console.error('Error deleting booking:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Bookings API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
