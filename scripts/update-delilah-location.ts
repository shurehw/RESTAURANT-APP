import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function updateLocation() {
  console.log('Updating Delilah Dallas location...\n');

  const { data, error } = await supabase
    .from('venues')
    .update({
      location: 'Dallas',
      city: 'Dallas',
      state: 'TX'
    })
    .eq('name', 'Delilah Dallas')
    .select();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('✅ Updated venue:');
  console.log(data);
}

updateLocation();
