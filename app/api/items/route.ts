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
    const { name, sku, category, base_uom } = body;

    if (!name || !sku) {
      return NextResponse.json(
        { error: 'Name and SKU are required' },
        { status: 400 }
      );
    }

    // Validate category is a valid enum value
    const validCategories = ['beverage', 'packaging', 'food'];
    const itemCategory = validCategories.includes(category?.toLowerCase())
      ? category.toLowerCase()
      : 'food';

    // Create the item
    const { data: item, error } = await supabase
      .from('items')
      .insert({
        name,
        sku,
        category: itemCategory,
        base_uom: base_uom || 'unit',
        is_active: true,
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
