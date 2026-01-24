import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixVendor() {
  // Update the existing vendor
  const { error } = await supabase
    .from('vendors')
    .update({
      normalized_name: 'specs wine spirits & finer foods',
    })
    .eq('id', '9f637b57-3ac7-48c3-bfab-aa653ccd9c34');

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('✅ Updated Spec\'s Wine, Spirits & Finer Foods vendor normalized_name');
}

fixVendor();
