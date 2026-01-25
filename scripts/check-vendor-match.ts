import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const normalize = (name: string) =>
  name.toLowerCase().replace(/[,\.']/g, '').replace(/\s+/g, ' ').trim();

const names = [
  'Dairyland Produce, LLC (dba Hardies Fresh Foods)',
  'Dairyland Produce, LLC'
];

async function check() {
  const { data: vendors } = await supabase.from('vendors').select('id, name, normalized_name');

  console.log('Vendors in DB:');
  vendors?.forEach(v => console.log(`  ${v.name} -> '${v.normalized_name}'`));

  console.log('\nLooking for:');
  names.forEach(n => {
    const norm = normalize(n);
    console.log(`  ${n} -> '${norm}'`);
    const match = vendors?.find(v => v.normalized_name === norm);
    console.log(`    Match: ${match ? 'YES (' + match.name + ')' : 'NO'}`);
  });
}

check();
