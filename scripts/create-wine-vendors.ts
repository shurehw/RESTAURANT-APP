import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const vendors = [
  'Johnson Brothers Maverick of Texas',
  'Republic National Distributing Company',
  'MFW - Maesor Fine Wine',
  'Alex Well',
];

(async () => {
  console.log('Creating wine vendors...\n');

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
      console.log(`✅ ${vendorName} - Created (${data.id})`);
    }
  }

  console.log('\nDone!');
})();
