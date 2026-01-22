import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSancerre() {
  console.log('\n=== Checking 2023 Sancerre, Dezat ===\n');

  const { data: item } = await supabase
    .from('items')
    .select('*, item_pack_configurations(*)')
    .eq('sku', 'DEZAT-SANC-23')
    .single();

  if (!item) {
    console.log('Item not found');
    return;
  }

  console.log('Item Details:');
  console.log(`  Name: ${item.name}`);
  console.log(`  SKU: ${item.sku}`);
  console.log(`  Category: ${item.category}`);
  console.log(`  Subcategory: ${item.subcategory}`);
  console.log(`  Base UOM: ${item.base_uom}`);
  console.log(`  GL Account ID: ${item.gl_account_id}`);

  console.log('\nPack Configurations:');
  const packConfigs = (item as any).item_pack_configurations || [];

  if (packConfigs.length === 0) {
    console.log('  ⚠️  NO PACK CONFIGS FOUND');
  } else {
    packConfigs.forEach((pc: any, idx: number) => {
      console.log(`  ${idx + 1}. ${pc.units_per_pack} × ${pc.unit_size}${pc.unit_size_uom}`);
      console.log(`     Pack Type: ${pc.pack_type}`);
      console.log(`     Conversion Factor: ${pc.conversion_factor}`);
      console.log(`     Vendor SKU: ${pc.vendor_item_code || 'N/A'}`);
      console.log('');
    });
  }

  // Check R365 source
  console.log('Checking R365 Excel source...');
  const XLSX = await import('xlsx');
  const workbook = XLSX.readFile('C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  const r365Match = (excelData as any[]).find((row: any) =>
    String(row['SKU      '] || '').trim() === 'DEZAT-SANC-23'
  );

  if (r365Match) {
    console.log('\n✓ Found in R365 Excel:');
    console.log(`  Name: ${r365Match['NAME']}`);
    console.log(`  Pack Size: ${r365Match['PACK SIZE      ']}`);
    console.log(`  Category: ${r365Match['Item Category 1']}`);
    console.log(`  Subcategory: ${r365Match['SUBCATEGORY      ']}`);
  } else {
    console.log('\n⚠️  NOT found in R365 Excel');
  }
}

checkSancerre().catch(console.error);
