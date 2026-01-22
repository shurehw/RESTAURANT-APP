import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get URL params for org filtering
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }

    // Fetch all active items with pack configs and GL accounts
    const { data: items, error } = await supabase
      .from('items')
      .select(`
        *,
        item_pack_configurations(*),
        gl_accounts(external_code, name)
      `)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching items:', error);
      return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
    }

    // Transform to R365 Excel format
    const exportData: any[] = [];

    for (const item of items || []) {
      const packConfigs = (item as any).item_pack_configurations || [];
      const glAccount = (item as any).gl_accounts;

      // If item has multiple pack configs, create a row for each
      if (packConfigs.length > 0) {
        for (const pack of packConfigs) {
          exportData.push({
            'SKU': item.sku || '',
            'NAME': item.name || '',
            'PACK SIZE': formatPackSize(pack),
            'Item Category 1': glAccount ? `${glAccount.external_code} - ${glAccount.name}` : '',
            'SUBCATEGORY': item.subcategory || '',
            'Measure Type': item.r365_measure_type || 'Weight',
            'Reporting UOM': item.r365_reporting_uom || pack.unit_size_uom || '',
            'Inventory UOM': item.r365_inventory_uom || pack.unit_size_uom || '',
            'Cost Account': item.r365_cost_account || '',
            'Inventory Account': item.r365_inventory_account || '',
            'Cost Update Method': item.r365_cost_update_method || 'Average',
            'Key Item': item.r365_key_item ? 'TRUE' : 'FALSE',
            'Vendor Item Code': pack.vendor_item_code || '',
            'Units Per Pack': pack.units_per_pack,
            'Unit Size': pack.unit_size,
            'Unit Size UOM': pack.unit_size_uom,
            'Conversion Factor': pack.conversion_factor,
            'Pack Type': pack.pack_type
          });
        }
      } else {
        // No pack configs - create single row
        exportData.push({
          'SKU': item.sku || '',
          'NAME': item.name || '',
          'PACK SIZE': '',
          'Item Category 1': glAccount ? `${glAccount.external_code} - ${glAccount.name}` : '',
          'SUBCATEGORY': item.subcategory || '',
          'Measure Type': item.r365_measure_type || 'Weight',
          'Reporting UOM': item.r365_reporting_uom || item.base_uom || '',
          'Inventory UOM': item.r365_inventory_uom || item.base_uom || '',
          'Cost Account': item.r365_cost_account || '',
          'Inventory Account': item.r365_inventory_account || '',
          'Cost Update Method': item.r365_cost_update_method || 'Average',
          'Key Item': item.r365_key_item ? 'TRUE' : 'FALSE',
          'Vendor Item Code': '',
          'Units Per Pack': '',
          'Unit Size': '',
          'Unit Size UOM': '',
          'Conversion Factor': '',
          'Pack Type': ''
        });
      }
    }

    // Create Excel workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Items Export');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // SKU
      { wch: 40 }, // NAME
      { wch: 15 }, // PACK SIZE
      { wch: 30 }, // Item Category 1
      { wch: 20 }, // SUBCATEGORY
      { wch: 15 }, // Measure Type
      { wch: 15 }, // Reporting UOM
      { wch: 15 }, // Inventory UOM
      { wch: 20 }, // Cost Account
      { wch: 20 }, // Inventory Account
      { wch: 20 }, // Cost Update Method
      { wch: 10 }, // Key Item
      { wch: 20 }, // Vendor Item Code
      { wch: 15 }, // Units Per Pack
      { wch: 12 }, // Unit Size
      { wch: 15 }, // Unit Size UOM
      { wch: 18 }, // Conversion Factor
      { wch: 12 }, // Pack Type
    ];

    // Convert to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="items-export-${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

// Format pack size in R365 format (e.g., "6 x 750ml", "750ml")
function formatPackSize(pack: any): string {
  if (pack.units_per_pack > 1) {
    return `${pack.units_per_pack} x ${pack.unit_size}${pack.unit_size_uom}`;
  }
  return `${pack.unit_size}${pack.unit_size_uom}`;
}
