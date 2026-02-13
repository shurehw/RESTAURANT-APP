/**
 * Admin API: Users
 * GET - List all users (auth.users + their org memberships)
 */

import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/requirePlatformAdmin';
import { createAdminClient } from '@/lib/supabase/server';

// GET /api/admin/users - List all users
export async function GET() {
  try {
    await requirePlatformAdmin();
    
    const adminClient = createAdminClient();
    
    // Get all auth users
    const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error fetching auth users:', authError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Get all organization memberships
    const { data: memberships } = await adminClient
      .from('organization_users')
      .select(`
        user_id,
        role,
        is_active,
        organization_id,
        organizations (
          id,
          name,
          slug
        )
      `);

    // Get custom users table for legacy info
    const { data: customUsers } = await adminClient
      .from('users')
      .select('id, email, full_name, is_active');

    // Build enriched user list
    const users = authUsers?.users?.map(authUser => {
      const userMemberships = memberships?.filter(m => m.user_id === authUser.id) || [];
      const customUser = customUsers?.find(
        cu => cu.email?.toLowerCase() === authUser.email?.toLowerCase()
      );

      return {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || customUser?.full_name || null,
        created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at,
        email_confirmed: !!authUser.email_confirmed_at,
        has_custom_user: !!customUser,
        custom_user_id: customUser?.id || null,
        organizations: userMemberships
          .filter((m): m is typeof m & { organizations: { id: string; name: string; slug: string } } => 
            !!m.is_active && m.organizations !== null
          )
          .map(m => ({
            id: m.organizations.id,
            name: m.organizations.name,
            slug: m.organizations.slug,
            role: m.role,
          })),
      };
    });

    return NextResponse.json({ 
      users,
      total: users?.length || 0,
    });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Admin users GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
