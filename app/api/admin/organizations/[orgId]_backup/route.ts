import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { z } from 'zod';

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  legal_name: z.string().optional().or(z.literal('')),
  owner_email: z.string().email().optional().or(z.literal('')),
  owner_name: z.string().optional().or(z.literal('')),
  plan: z.enum(['trial', 'starter', 'professional', 'enterprise']).optional(),
  max_venues: z.number().int().min(1).optional(),
});

/**
 * PATCH - Update an organization
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
    const validated = updateOrgSchema.parse(body);

    const updateData: any = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.legal_name !== undefined) updateData.legal_name = validated.legal_name || null;
    if (validated.owner_email !== undefined) updateData.primary_contact_email = validated.owner_email || null;
    if (validated.owner_name !== undefined) updateData.primary_contact_name = validated.owner_name || null;
    if (validated.plan !== undefined) updateData.plan = validated.plan;
    if (validated.max_venues !== undefined) updateData.max_venues = validated.max_venues;

    const { data: org, error } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ organization: org, message: 'Organization updated successfully' });
  });
}

/**
 * DELETE - Delete an organization
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
      .from('organizations')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ message: 'Organization deleted successfully' });
  });
}
