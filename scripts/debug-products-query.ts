import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugQuery() {
  // Get org ID
  const { data: items } = await supabase
    .from('items')
    .select('organization_id')
    .limit(1);

  const orgId = items?.[0]?.organization_id;
  console.log('Org ID:', orgId);
  console.log('');

  // Try the exact query the products page uses
  const result = await supabase
    .from("items")
    .select("id, name, sku, category, subcategory, base_uom, gl_account_id, r365_measure_type, r365_reporting_uom, r365_inventory_uom, r365_cost_account, r365_inventory_account, created_at, organization_id, is_active")
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order("created_at", { ascending: false })
    .limit(10000);

  console.log(`Query returned ${result.data?.length || 0} items`);
  console.log(`Error:`, result.error);
  console.log('');

  if (result.data && result.data.length > 0) {
    console.log('First item:', result.data[0].name);
    console.log('Last item:', result.data[result.data.length - 1].name);
    console.log('');

    // Search for Don Julio
    const donJulio = result.data.filter((item: any) =>
      item.name.toLowerCase().includes('don julio')
    );
    console.log(`Don Julio items in results: ${donJulio.length}`);
    donJulio.forEach((item: any) => {
      console.log(`  - ${item.name}`);
    });
  }
}

debugQuery();
