import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';
import {
  inferCategory,
  inferSubcategory,
  inferItemType,
  inferGlExternalCode,
  inferR365MeasureType,
  getR365Uom,
  deriveR365Accounts,
  getGlAccountId,
  inferPackConfigFromName,
} from '@/lib/items/inference';

/**
 * POST /api/items
 * Create a new item in the product catalog
 * 
 * Auto-infers:
 * - Category (if not provided)
 * - Subcategory (if not provided)
 * - GL account (if not provided)
 * - R365 fields (measure_type, reporting_uom, inventory_uom, cost_account, inventory_account)
 * - Pack configuration (if not provided)
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

    // Validate or infer category
    const validCategories = [
      'food', 'beverage', 'packaging', 'supplies',
      'liquor', 'wine', 'beer', 'spirits', 'non_alcoholic_beverage',
      'produce', 'meat', 'seafood', 'dairy', 'dry_goods', 'frozen',
      'disposables', 'chemicals', 'smallwares', 'other', 'bar_consumables', 'grocery', 'bakery'
    ];
    
    // Use provided category if valid, otherwise infer from name
    const itemCategory = validCategories.includes(category?.toLowerCase())
      ? category.toLowerCase()
      : inferCategory(name);
    
    // Infer subcategory if not provided
    const itemSubcategory = subcategory || inferSubcategory(name, itemCategory);
    
    // Infer item type if not provided
    const itemItemType = item_type || inferItemType(itemCategory);

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

    // Auto-infer GL account if not provided
    let finalGlAccountId = gl_account_id;
    if (!finalGlAccountId) {
      const glExternalCode = inferGlExternalCode(itemCategory, itemSubcategory);
      finalGlAccountId = await getGlAccountId(adminClient, orgId, glExternalCode);
    }

    // Infer R365 fields
    const r365MeasureType = inferR365MeasureType(itemCategory);
    const r365Uom = getR365Uom(r365MeasureType);
    const glExternalCode = inferGlExternalCode(itemCategory, itemSubcategory);
    const r365Accounts = deriveR365Accounts(glExternalCode);

    // Create item using admin client (bypasses RLS)
    const { data: item, error } = await adminClient
      .from('items')
      .insert({
        name,
        sku,
        category: itemCategory,
        subcategory: itemSubcategory,
        base_uom: base_uom || 'unit',
        gl_account_id: finalGlAccountId,
        organization_id: orgId,
        is_active: true,
        item_type: itemItemType,
        // R365 fields (auto-populated)
        r365_measure_type: r365MeasureType,
        r365_reporting_uom: r365Uom,
        r365_inventory_uom: r365Uom,
        r365_cost_account: r365Accounts.r365_cost_account,
        r365_inventory_account: r365Accounts.r365_inventory_account,
        r365_cost_update_method: 'Standard',
        r365_key_item: false,
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

    // Add pack configurations if provided, or auto-generate from item name
    let packConfigsToInsert: any[] = [];
    
    if (pack_configurations && Array.isArray(pack_configurations) && pack_configurations.length > 0) {
      packConfigsToInsert = pack_configurations.map(config => ({
        item_id: item.id,
        pack_type: config.pack_type,
        units_per_pack: config.units_per_pack,
        unit_size: config.unit_size,
        unit_size_uom: config.unit_size_uom,
      }));
    } else {
      // Auto-infer pack config from item name
      const inferredPack = inferPackConfigFromName(name);
      if (inferredPack) {
        packConfigsToInsert = [{
          item_id: item.id,
          pack_type: inferredPack.pack_type,
          units_per_pack: inferredPack.units_per_pack,
          unit_size: inferredPack.unit_size,
          unit_size_uom: inferredPack.unit_size_uom,
        }];
      } else {
        // Default pack config (1 each)
        packConfigsToInsert = [{
          item_id: item.id,
          pack_type: 'each',
          units_per_pack: 1,
          unit_size: 1,
          unit_size_uom: 'each',
        }];
      }
    }

    if (packConfigsToInsert.length > 0) {
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
