import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createVendor() {
  // Check if vendor already exists
  const { data: existing } = await supabase
    .from('vendors')
    .select('*')
    .eq('normalized_name', 'specs liquors')
    .maybeSingle();

  if (existing) {
    console.log(`✅ Vendor already exists: Spec's Liquors (${existing.id})`);
    return;
  }

  // Create vendor (vendors table is not organization-scoped)
  const { data: vendor, error } = await supabase
    .from('vendors')
    .insert({
      name: "Spec's Liquors",
      normalized_name: 'specs liquors',
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating vendor:', error);
    process.exit(1);
  }

  console.log(`✅ Created vendor: Spec's Liquors (${vendor.id})`);
}

createVendor();
