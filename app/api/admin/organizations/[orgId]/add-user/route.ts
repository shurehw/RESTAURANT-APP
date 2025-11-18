import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  return guard(async () => {
    const { orgId } = await params;
    const supabase = await createClient();
    const body = await request.json();
    const { user_id, role = 'user' } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    // Check if user is already in organization
    const { data: existing } = await supabase
      .from('organization_users')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', user_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'User already in organization' },
        { status: 400 }
      );
    }

    // Add user to organization
    const { error } = await supabase
      .from('organization_users')
      .insert({
        organization_id: orgId,
        user_id,
        role,
        is_active: true,
      });

    if (error) {
      console.error('Error adding user to organization:', error);
      return NextResponse.json(
        { error: 'Failed to add user to organization', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  });
}
