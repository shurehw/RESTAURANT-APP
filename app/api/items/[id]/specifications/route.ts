import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/items/[id]/specifications
 * Returns the canonical specifications for an item.
 *
 * PUT /api/items/[id]/specifications
 * Updates the canonical specifications for an item.
 * Body: { specifications: { brand?: string, grade?: string, ... } }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: item, error } = await supabase
    .from('items')
    .select('id, name, specifications')
    .eq('id', id)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json({
    item_id: item.id,
    name: item.name,
    specifications: item.specifications || {},
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { specifications } = body;

  if (specifications === undefined) {
    return NextResponse.json({ error: 'specifications field required' }, { status: 400 });
  }

  // Validate: must be object or null
  if (specifications !== null && typeof specifications !== 'object') {
    return NextResponse.json({ error: 'specifications must be an object or null' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('items')
    .update({
      specifications: specifications || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, name, specifications')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    item_id: data.id,
    name: data.name,
    specifications: data.specifications,
  });
}
