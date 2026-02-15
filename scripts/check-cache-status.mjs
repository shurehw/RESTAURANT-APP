import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCache() {
  console.log('Checking cache for Delilah LA on 2026-02-08...\n');

  // 1. Get Delilah LA mapping
  const { data: mapping, error: mapError } = await supabase
    .from('venue_tipsee_mapping')
    .select('venue_id, tipsee_location_uuid, tipsee_location_name')
    .ilike('tipsee_location_name', '%Delilah%LA%')
    .maybeSingle();

  console.log('Delilah LA mapping:', mapping);
  if (mapError) console.log('Mapping error:', mapError);

  if (!mapping) {
    console.log('❌ No mapping found for Delilah LA');
    return;
  }

  // 2. Check cache for Feb 8
  const { data: cache, error } = await supabase
    .from('tipsee_nightly_cache')
    .select('business_date, synced_at')
    .eq('venue_id', mapping.venue_id)
    .eq('business_date', '2026-02-08')
    .maybeSingle();

  console.log('\nCache entry for 2/8:', cache);
  if (error) console.log('Cache error:', error);

  if (cache) {
    console.log('✅ Cache exists for Delilah LA on 2/8');
    console.log('   Synced at:', cache.synced_at);
  } else {
    console.log('❌ No cache entry for Delilah LA on 2/8');
  }

  // 3. Check all cache entries
  const { data: all } = await supabase
    .from('tipsee_nightly_cache')
    .select('business_date, venue_id')
    .order('business_date', { ascending: false })
    .limit(10);

  console.log('\nAll recent cache entries:');
  all?.forEach(r => console.log(`  ${r.business_date} - venue ${r.venue_id.substring(0, 8)}`));
}

checkCache().catch(console.error);
