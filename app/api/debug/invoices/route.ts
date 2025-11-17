import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({
      error: 'Not authenticated',
      authError: authError?.message
    });
  }

  // Check org membership
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', user.id);

  // Check accessible venues
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, organization_id')
    .eq('is_active', true);

  // Query invoices
  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      vendor_id,
      venue_id,
      total_amount,
      status
    `)
    .order('invoice_date', { ascending: false })
    .limit(50);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email
    },
    orgMemberships: orgUsers,
    venues: venues,
    invoices: invoices,
    invoicesError: invoicesError?.message
  });
}
