import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { z } from 'zod';

const updateVenueSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  zip_code: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  organization_id: z.string().uuid().optional().or(z.literal('')).nullable(),
});

/**
 * PATCH - Update a venue
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const user = await requireUser();
    const supabase = await createClient();

    // Check if user is super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Super admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const validated = updateVenueSchema.parse(body);

    const updateData: any = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.location !== undefined) updateData.location = validated.location || null;
    if (validated.address !== undefined) updateData.address = validated.address || null;
    if (validated.city !== undefined) updateData.city = validated.city || null;
    if (validated.state !== undefined) updateData.state = validated.state || null;
    if (validated.zip_code !== undefined) updateData.zip_code = validated.zip_code || null;
    if (validated.phone !== undefined) updateData.phone = validated.phone || null;
    if (validated.organization_id !== undefined) updateData.organization_id = validated.organization_id || null;

    const { data: venue, error } = await supabase
      .from('venues')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating venue:', error);
      return NextResponse.json({
        error: error.message,
        details: error,
        updateData
      }, { status: 500 });
    }

    return NextResponse.json({ venue, message: 'Venue updated successfully' });
  });
}

/**
 * DELETE - Delete a venue
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const user = await requireUser();
    const supabase = await createClient();

    // Check if user is super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized: Super admin access required' }, { status: 403 });
    }

    const { error } = await supabase
      .from('venues')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ message: 'Venue deleted successfully' });
  });
}
