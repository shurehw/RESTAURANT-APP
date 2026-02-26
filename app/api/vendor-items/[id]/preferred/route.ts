import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PUT /api/vendor-items/[id]/preferred
 * Toggle the is_preferred flag on a vendor_items record.
 * Body: { is_preferred: boolean }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { is_preferred } = body;

  if (typeof is_preferred !== 'boolean') {
    return NextResponse.json({ error: 'is_preferred must be a boolean' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('vendor_items')
    .update({
      is_preferred,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, item_id, vendor_id, is_preferred')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vendor_item: data });
}
