import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const vendors = [
  'MFW - Maxxor Fine Wine',  // another typo variant
  'Republic National Distributing Company (RNDC)',  // another variant
  'RNDC',  // short form
];

(async () => {
  for (const vendorName of vendors) {
    const { data, error } = await supabase
      .from('vendors')
      .insert({
        name: vendorName,
        normalized_name: vendorName.toLowerCase(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        console.log(`⚠️  ${vendorName} - exists`);
      } else {
        console.error(`❌ ${vendorName}:`, error.message);
      }
    } else {
      console.log(`✅ ${vendorName}`);
    }
  }
})();
