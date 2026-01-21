import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';

/**
 * POST /api/items/bulk-import
 * Bulk import items from Excel (R365 format)
 * Consolidates items with multiple pack sizes into single item with multiple pack configs
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const supabase = await createClient();
    const body = await request.json();
    const { items } = body; // Array of parsed Excel rows

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      );
    }

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

    const orgId = orgUsers[0].organization_id;

    // Group items by name (consolidate pack sizes)
    const itemGroups = new Map<string, any[]>();
    for (const item of items) {
      const name = item.ITEM?.trim();
      if (!name) continue;

      if (!itemGroups.has(name)) {
        itemGroups.set(name, []);
      }
      itemGroups.get(name)!.push(item);
    }

    console.log(`Processing ${itemGroups.size} unique items from ${items.length} rows`);

    const results = {
      created: 0,
      skipped: 0,
      errors: [] as any[],
    };

    // Process each item group
    for (const [itemName, rows] of itemGroups.entries()) {
      try {
        const firstRow = rows[0];

        // Parse GL Account from "5310 - Liquor Cost" format
        const glAccountCode = firstRow.Item_Category_1?.match(/^(\d+)/)?.[1];
        let glAccountId = null;

        if (glAccountCode) {
          const { data: glAccount } = await supabase
            .from('gl_accounts')
            .select('id')
            .eq('organization_id', orgId)
            .eq('external_code', glAccountCode)
            .single();

          glAccountId = glAccount?.id;
        }

        // Map R365 subcategory to our category
        const subcategory = firstRow.SUBCATEGORY?.trim();
        let category = 'liquor';
        if (['Tequila', 'Whiskey', 'Vodka', 'Gin', 'Rum', 'Cognac'].includes(subcategory)) {
          category = 'liquor';
        } else if (['Liqueur', 'Aperitif'].includes(subcategory)) {
          category = 'liquor';
        } else if (subcategory === 'Wine') {
          category = 'wine';
        } else if (subcategory === 'Beer') {
          category = 'beer';
        }

        // Parse base UOM from Reporting U of M (750ml, 1L, etc.)
        const reportingUOM = firstRow.Reporting_U_of_M?.toLowerCase() || 'oz';
        let baseUom = 'oz'; // Default for beverages

        // For beverages, we always use 'oz' as recipe unit (consistent with existing logic)
        // Pack configs will handle conversion from ml/L to oz

        // Use SKU from first row if available, otherwise generate
        // Note: In R365 exports, same item can have multiple SKUs for different pack sizes
        // We'll use the first SKU as the master SKU, and store others in pack configs
        const firstRowSKU = firstRow.SKU?.toString().trim();
        const sku = firstRowSKU || `AUTO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create the item with R365 fields for round-trip compatibility
        const { data: newItem, error: itemError} = await supabase
          .from('items')
          .insert({
            organization_id: orgId,
            name: itemName,
            sku,
            category,
            subcategory: subcategory || null,
            base_uom: baseUom,
            gl_account_id: glAccountId,
            is_active: true,
            // R365 integration fields
            r365_measure_type: firstRow.Measure_Type || null,
            r365_reporting_uom: firstRow.Reporting_U_of_M || null,
            r365_inventory_uom: firstRow.Inventory_U_of_M || null,
            r365_cost_account: firstRow.Cost_Account || null,
            r365_inventory_account: firstRow.Inventory_Account || null,
            r365_cost_update_method: firstRow.Cost_Update_Method || null,
            r365_key_item: firstRow.Key_Item || false,
          })
          .select()
          .single();

        if (itemError || !newItem) {
          results.errors.push({
            item: itemName,
            error: itemError?.message || 'Failed to create item',
          });
          results.skipped++;
          continue;
        }

        // Create pack configurations for each pack size
        // Group by unique pack size to avoid duplicates, but keep vendor SKU from each
        const packConfigMap = new Map<string, any>();

        for (const row of rows) {
          const packSize = row.PACK_SIZE?.trim();
          if (!packSize) continue;

          // Parse pack size (e.g., "6 x 750ml" or "750ml")
          const packMatch = packSize.match(/^(\d+)\s*x\s*(\d+\.?\d*)(ml|l|oz)$/i);
          const singleMatch = packSize.match(/^(\d+\.?\d*)(ml|l|oz)$/i);

          let configKey = '';
          let config: any = null;

          if (packMatch) {
            // Case pack: "6 x 750ml"
            const unitsPerPack = parseInt(packMatch[1]);
            const unitSize = parseFloat(packMatch[2]);
            const unitSizeUom = packMatch[3].toLowerCase();

            configKey = `case-${unitsPerPack}-${unitSize}-${unitSizeUom}`;
            config = {
              item_id: newItem.id,
              pack_type: 'case',
              units_per_pack: unitsPerPack,
              unit_size: unitSize,
              unit_size_uom: unitSizeUom,
              vendor_sku: row.SKU?.toString().trim() || null,
            };
          } else if (singleMatch) {
            // Single bottle: "750ml"
            const unitSize = parseFloat(singleMatch[1]);
            const unitSizeUom = singleMatch[2].toLowerCase();

            configKey = `bottle-1-${unitSize}-${unitSizeUom}`;
            config = {
              item_id: newItem.id,
              pack_type: 'bottle',
              units_per_pack: 1,
              unit_size: unitSize,
              unit_size_uom: unitSizeUom,
              vendor_sku: row.SKU?.toString().trim() || null,
            };
          }

          // Only add if we haven't seen this exact pack config yet
          // (Some items have same pack size with different vendor SKUs - keep first one)
          if (config && !packConfigMap.has(configKey)) {
            packConfigMap.set(configKey, config);
          }
        }

        const packConfigs = Array.from(packConfigMap.values());

        // Insert pack configs
        if (packConfigs.length > 0) {
          const { error: packError } = await supabase
            .from('item_pack_configs')
            .insert(packConfigs);

          if (packError) {
            console.error(`Failed to create pack configs for ${itemName}:`, packError);
          }
        }

        results.created++;
      } catch (error) {
        console.error(`Error processing ${itemName}:`, error);
        results.errors.push({
          item: itemName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results.skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Created ${results.created} items, skipped ${results.skipped}`,
    });
  });
}
