import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';

/**
 * POST /api/items
 * Create a new item in the product catalog
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const supabase = await createClient();
    const cookieStore = await cookies();

    const body = await request.json();
    const { name, sku, category, subcategory, base_uom, gl_account_id, organization_id, item_type, pack_configurations } = body;

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
      'disposables', 'chemicals', 'smallwares', 'other', 'bar_consumable'
    ];
    const itemCategory = validCategories.includes(category?.toLowerCase())
      ? category.toLowerCase()
      : 'food';

    // Get user's organization if not provided
    let orgId = organization_id;

    // Get user ID from cookie (custom auth) or Supabase session
    let userId: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else {
      const userIdCookie = cookieStore.get('user_id');
      userId = userIdCookie?.value || null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - No active session' },
        { status: 401 }
      );
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient();

    if (!orgId) {
      // Get user's organization
      const { data: orgUsers } = await adminClient
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      // Use first organization if user belongs to multiple
      orgId = orgUsers?.[0]?.organization_id;
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'User not associated with an organization' },
        { status: 403 }
      );
    }

    // Create item using admin client (bypasses RLS)
    const { data: item, error } = await adminClient
      .from('items')
      .insert({
        name,
        sku,
        category: itemCategory,
        subcategory: subcategory || null,
        base_uom: base_uom || 'unit',
        gl_account_id: gl_account_id || null,
        organization_id: orgId,
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

    // Add pack configurations if provided
    if (pack_configurations && Array.isArray(pack_configurations) && pack_configurations.length > 0) {
      const packConfigsToInsert = pack_configurations.map(config => ({
        item_id: item.id,
        pack_type: config.pack_type,
        units_per_pack: config.units_per_pack,
        unit_size: config.unit_size,
        unit_size_uom: config.unit_size_uom,
      }));

      const { error: packError } = await adminClient
        .from('item_pack_configurations')
        .insert(packConfigsToInsert);

      if (packError) {
        console.error('Error adding pack configurations:', packError);
        // Don't fail the whole request, just log the error
      }
    }

    return NextResponse.json({ item });
  });
}
