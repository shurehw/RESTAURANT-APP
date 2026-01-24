import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function fixR365MeasureType() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Updating r365_measure_type to "Each" for all items...');

  // Update all items to have r365_measure_type = "Each"
  const { data, error } = await supabase
    .from('items')
    .update({ r365_measure_type: 'Each' })
    .neq('r365_measure_type', 'Each')
    .select('id');

  if (error) {
    console.error('Error updating items:', error);
    return;
  }

  console.log(`✓ Updated ${data?.length || 0} items to have r365_measure_type = "Each"`);

  // Show summary
  const { count } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('r365_measure_type', 'Each');

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total items with r365_measure_type = "Each": ${count}`);
}

fixR365MeasureType().catch(console.error);
