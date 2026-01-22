import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';

/**
 * POST /api/items
 * Create a new item in the product catalog
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const supabase = await createClient();

    const body = await request.json();
    const { name, sku, category, subcategory, base_uom, gl_account_id, organization_id, item_type } = body;

    if (!name || !sku) {
      return NextResponse.json(
        { error: 'Name and SKU are required' },
        { status: 400 }
      );
    }

    // Validate category is a valid enum value
    const validCategories = [
      'food', 'beverage', 'packaging', 'supplies',
      'liquor', 'wine', 'beer', 'spirits', 'non_alcoholic_beverage',
      'produce', 'meat', 'seafood', 'dairy', 'dry_goods', 'frozen',
      'disposables', 'chemicals', 'smallwares', 'other'
    ];
    const itemCategory = validCategories.includes(category?.toLowerCase())
      ? category.toLowerCase()
      : 'food';

    // Get user's organization if not provided
    let orgId = organization_id;
    if (!orgId) {
      const { data: user } = await supabase.auth.getUser();
      if (user?.user) {
        const { data: orgUsers } = await supabase
          .from('organization_users')
          .select('organization_id')
          .eq('user_id', user.user.id)
          .eq('is_active', true);
        // Use first organization if user belongs to multiple
        orgId = orgUsers?.[0]?.organization_id;
      }
    }

    // Create the item
    const { data: item, error } = await supabase
      .from('items')
      .insert({
        name,
        sku,
        category: itemCategory,
        subcategory: subcategory || null,
        base_uom: base_uom || 'unit',
        gl_account_id: gl_account_id || null,
        organization_id: orgId || null,
        is_active: true,
        item_type: item_type || 'beverage', // Default to beverage for now
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating item:', error);
      return NextResponse.json(
        { error: 'Failed to create item', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ item });
  });
}
