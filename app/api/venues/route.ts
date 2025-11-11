import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';

/**
 * GET - List venues for organization
 * Supports ?organization_id=xxx for admin purposes
 */
export async function GET(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const supabase = await createClient();

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('organization_id');

    // If organization_id is provided, fetch for that org (admin use case)
    if (orgId) {
      const { data: venues, error } = await supabase
        .from('venues')
        .select('id, name, location, organization_id')
        .eq('organization_id', orgId);

      if (error) throw error;

      return NextResponse.json({ venues: venues || [] });
    }

    // Otherwise, fetch venues for user's organizations
    const { data: userOrgs } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id);

    const orgIds = userOrgs?.map(o => o.organization_id) || [];

    if (orgIds.length === 0) {
      return NextResponse.json({ venues: [] });
    }

    const { data: venues, error } = await supabase
      .from('venues')
      .select('id, name, location, organization_id')
      .in('organization_id', orgIds);

    if (error) throw error;

    return NextResponse.json({ venues: venues || [] });
  });
}
