import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createVendors() {
  const vendors = [
    {
      name: "Spec's Wine, Spirits & Finer Foods",
      normalized_name: 'specs wine spirits & finer foods',
    },
    {
      name: "Southern Glazer's of TX",
      normalized_name: 'southern glazers of tx',
    },
  ];

  for (const vendor of vendors) {
    // Check if exists
    const { data: existing } = await supabase
      .from('vendors')
      .select('*')
      .eq('normalized_name', vendor.normalized_name)
      .maybeSingle();

    if (existing) {
      console.log(`✅ Vendor already exists: ${vendor.name} (${existing.id})`);
      continue;
    }

    // Create vendor
    const { data: created, error } = await supabase
      .from('vendors')
      .insert({
        name: vendor.name,
        normalized_name: vendor.normalized_name,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating ${vendor.name}:`, error);
      continue;
    }

    console.log(`✅ Created vendor: ${vendor.name} (${created.id})`);
  }
}

createVendors();
