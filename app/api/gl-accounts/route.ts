import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';

/**
 * GET /api/gl-accounts
 * Fetch all active GL accounts for the user's organization
 */
export async function GET() {
  return guard(async () => {
    const supabase = await createClient();

    // Get user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Debug logging
    if (!user) {
      console.error('[GL Accounts] No user found in session. Auth error:', authError);
      console.error('[GL Accounts] This might be a cookie/session issue');
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - No active session', details: 'User not authenticated. Please log in again.' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Get user's organization
    const { data: orgUsers, error: orgError } = await supabase
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

    // Fetch only COGS and Opex GL accounts (relevant for items/inventory)
    // Exclude Revenue, Assets, Liabilities, Equity, and other non-operational accounts
    const { data: accounts, error } = await supabase
      .from('gl_accounts')
      .select('id, external_code, name, section, display_order')
      .eq('org_id', orgUser.organization_id)
      .eq('is_active', true)
      .eq('is_summary', false)
      .in('section', ['COGS', 'Opex'])
      .order('section')
      .order('display_order');

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
