import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkVenues() {
  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, name, organization_id, pos_type, is_active')
    .order('name');

  if (error) {
    console.error('Error fetching venues:', error);
    return;
  }

  console.log('\n=== EXISTING VENUES ===');
  console.table(venues);

  // Check for Delilah Dallas
  const delilahDallas = venues?.find(v => v.name.includes('Delilah') && v.name.includes('Dallas'));

  if (!delilahDallas) {
    console.log('\n⚠️  Delilah Dallas venue not found');
    console.log('Need to create it for h.woods pre-opening invoices');
  } else {
    console.log('\n✓ Delilah Dallas venue exists:', delilahDallas.id);
  }
}

checkVenues();
