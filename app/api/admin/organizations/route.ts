import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { z } from 'zod';

const createOrgSchema = z.object({
  name: z.string().min(1),
  legal_name: z.string().optional(),
  owner_email: z.string().email().optional().or(z.literal('')),
  owner_name: z.string().optional().or(z.literal('')),
  plan: z.enum(['trial', 'starter', 'professional', 'enterprise']).default('trial'),
  max_venues: z.number().int().min(1).default(1),
});

/**
 * GET - List all organizations (Super Admin only)
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

    // Get all organizations
    const { data: organizations, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (orgError) throw orgError;

    // Check which have custom databases
    const { data: customDbs } = await supabase
      .from('customer_databases')
      .select('organization_id, is_active')
      .eq('is_active', true);

    const customDbOrgIds = new Set(customDbs?.map(db => db.organization_id) || []);

    const orgsWithDbInfo = organizations?.map(org => ({
      ...org,
      has_custom_db: customDbOrgIds.has(org.id),
    })) || [];

    return NextResponse.json({ organizations: orgsWithDbInfo });
  });
}

/**
 * POST - Create new customer organization
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
    const validated = createOrgSchema.parse(body);

    // 1. Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: validated.name,
        legal_name: validated.legal_name,
        plan: validated.plan,
        subscription_status: validated.plan === 'trial' ? 'trial' : 'active',
        max_venues: validated.max_venues,
        trial_ends_at: validated.plan === 'trial'
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
          : null,
        primary_contact_email: validated.owner_email || null,
        primary_contact_name: validated.owner_name || null,
      })
      .select()
      .single();

    if (orgError) throw orgError;

    // 2. TODO: If owner email provided, send invitation
    if (validated.owner_email) {
      console.log(`Send invitation email to ${validated.owner_email} for org ${org.id}`);
    }

    return NextResponse.json({
      organization: org,
      message: 'Organization created successfully.',
    });
  });
}
