import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  console.log('Looking for Delilah Dallas venue...\n');

  const { data: delilahs } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', '%delilah%');

  if (delilahs && delilahs.length > 0) {
    console.log('Found Delilah venues:');
    delilahs.forEach(v => console.log(`  ${v.name}: ${v.id}`));
  } else {
    console.log('No Delilah venues found. All venues:');
    const { data: allVenues } = await supabase
      .from('venues')
      .select('id, name')
      .order('name');
    allVenues?.forEach(v => console.log(`  ${v.name}: ${v.id}`));
  }
})();
