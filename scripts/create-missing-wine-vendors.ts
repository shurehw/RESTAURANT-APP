import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const vendors = [
  'MFW - Maekor Fine Wine',  // typo variant
  'CITY WINE MERCHANTS',
  'RNDC - Republic National Distributing Company',  // variant
  'RNDC (Republic National Distributing Company)',  // variant
  'Johnson Brothers of Texas',  // variant
];

(async () => {
  console.log('Creating missing wine vendors...\n');

  for (const vendorName of vendors) {
    const normalizedName = vendorName.toLowerCase();
    
    const { data, error } = await supabase
      .from('vendors')
      .insert({
        name: vendorName,
        normalized_name: normalizedName,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        console.log(`⚠️  ${vendorName} - already exists`);
      } else {
        console.error(`❌ ${vendorName} - Error:`, error.message);
      }
    } else {
      console.log(`✅ ${vendorName} - Created`);
    }
  }
})();
