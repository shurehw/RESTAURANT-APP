import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';

/**
 * GET /api/gl-accounts
 * Fetch all active GL accounts for the user's organization
 */
export async function GET() {
  return guard(async () => {
    const supabase = await createClient();
    const cookieStore = await cookies();

    // Get user ID from cookie (our custom auth) or Supabase session
    let userId: string | null = null;

    // Try Supabase session first
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else {
      // Fallback to custom user_id cookie
      const userIdCookie = cookieStore.get('user_id');
      userId = userIdCookie?.value || null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - No active session', details: 'User not authenticated. Please log in again.' },
        { status: 401 }
      );
    }

    // Use admin client to bypass RLS for organization and GL queries
    // This is necessary because custom auth users don't have auth.uid() set
    const adminClient = createAdminClient();

    // Get user's organization
    const { data: orgUsers, error: orgError } = await adminClient
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (orgError) {
      console.error('Error fetching org users:', orgError);
      return NextResponse.json(
        { error: 'Failed to fetch user organization', details: orgError.message },
        { status: 500 }
      );
    }

    if (!orgUsers || orgUsers.length === 0) {
      return NextResponse.json(
        { error: 'User not associated with an organization' },
        { status: 403 }
      );
    }

    // Use first organization if user belongs to multiple
    const orgUser = orgUsers[0];

    console.log('[GL Accounts] User ID:', userId);
    console.log('[GL Accounts] Org ID:', orgUser.organization_id);

    // Fetch only COGS and Opex GL accounts (relevant for items/inventory)
    // Exclude Revenue, Assets, Liabilities, Equity, and other non-operational accounts
    // Use admin client to bypass RLS (we've already verified user has access to this org)
    const { data: accounts, error } = await adminClient
      .from('gl_accounts')
      .select('id, external_code, name, section, display_order')
      .eq('org_id', orgUser.organization_id)
      .eq('is_active', true)
      .eq('is_summary', false)
      .in('section', ['COGS', 'Opex'])
      .order('section')
      .order('display_order');

    console.log('[GL Accounts] Query completed. Found:', accounts?.length || 0);

    if (error) {
      console.error('Error fetching GL accounts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch GL accounts', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      accounts: accounts || [],
    });
  });
}
