/**
 * Entertainment Performers API
 * CRUD operations for performers/artists
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

    const adminClient = createAdminClient();

    let query = adminClient
      .from('entertainment_artists')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .order('name');

    if (venueId) {
      query = query.eq('venue_id', venueId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching performers:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('Performers API error:', error);
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
    const { name, entertainment_type, phone, email, standard_rate, is_coordinator, notes, venue_id } = body;

    if (!name || !entertainment_type) {
      return NextResponse.json(
        { error: 'Name and entertainment type are required' },
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
      .from('entertainment_artists')
      .insert({
        organization_id: organizationId,
        venue_id: venue_id || null,
        name,
        entertainment_type,
        phone: phone || null,
        email: email || null,
        standard_rate: standard_rate || null,
        is_coordinator: is_coordinator || false,
        notes: notes || null,
      } as any)
      .select()
      .single();

    if (error) {
      console.error('Error creating performer:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Performers API error:', error);
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
      return NextResponse.json({ error: 'Performer ID is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('entertainment_artists')
      .delete()
      .eq('id', id)
      .eq('organization_id', ctx.orgId);

    if (error) {
      console.error('Error deleting performer:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Performers API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
