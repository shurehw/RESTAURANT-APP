import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { z } from 'zod';

const createVenueSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  zip_code: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  organization_id: z.string().uuid().optional().or(z.literal('')), // Optional for standalone venues
});

/**
 * GET - List all venues (Super Admin only)
 */
export async function GET(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const supabase = await createClient();

    // Check if user is super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Super admin access required' }, { status: 403 });
    }

    // Get all venues with organization info
    const { data: venues, error } = await supabase
      .from('venues')
      .select(`
        *,
        organization:organizations(id, name)
      `)
      .order('name');

    if (error) throw error;

    return NextResponse.json({ venues: venues || [] });
  });
}

/**
 * POST - Create new venue
 */
export async function POST(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const supabase = await createClient();

    // Check if user is super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Super admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const validated = createVenueSchema.parse(body);

    // Create venue
    const { data: venue, error } = await (supabase as any)
      .from('venues')
      .insert({
        name: validated.name,
        location: validated.location || null,
        address: validated.address || null,
        city: validated.city || null,
        state: validated.state || null,
        zip_code: validated.zip_code || null,
        phone: validated.phone || null,
        organization_id: validated.organization_id || null, // Can be null for standalone venues
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      venue,
      message: 'Venue created successfully.',
    });
  });
}
