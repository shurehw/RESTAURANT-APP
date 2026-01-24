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

    // Get user's organization
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: orgUsers } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.user.id)
      .eq('is_active', true);

    if (!orgUsers || orgUsers.length === 0) {
      return NextResponse.json(
        { error: 'User not associated with an organization' },
        { status: 403 }
      );
    }

    // Use first organization if user belongs to multiple
    const orgUser = orgUsers[0];

    // Fetch all active, non-summary GL accounts
    const { data: accounts, error } = await supabase
      .from('gl_accounts')
      .select('id, external_code, name, section, display_order')
      .eq('org_id', orgUser.organization_id)
      .eq('is_active', true)
      .eq('is_summary', false)
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
