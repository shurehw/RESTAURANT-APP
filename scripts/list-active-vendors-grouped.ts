/**
 * List all active vendors grouped by aggressive normalization
 * to identify remaining duplicates
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function aggressiveNormalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\b(the|inc|llc|corp|co|ltd|foods|food|company|enterprises|enterprise|distribution|dist|supply|supplies|produce)\b/g, '')
    .trim();
}

async function main() {
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, is_active')
    .eq('is_active', true)
    .order('name');

  if (error || !vendors) {
    console.error('Error:', error);
    return;
  }

  const groups = new Map<string, any[]>();
  for (const v of vendors) {
    const key = aggressiveNormalize(v.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  const dupes = Array.from(groups.entries()).filter(([_, v]) => v.length > 1);

  console.log(`Total active vendors: ${vendors.length}`);
  console.log(`Duplicate groups: ${dupes.length}\n`);

  if (dupes.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }

  console.log('Remaining duplicate groups:\n');
  for (const [norm, vends] of dupes) {
    console.log(`Group "${norm}":`);
    for (const v of vends) {
      console.log(`  - ${v.name} (${v.is_active ? 'ACTIVE' : 'inactive'})`);
    }
    console.log();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
