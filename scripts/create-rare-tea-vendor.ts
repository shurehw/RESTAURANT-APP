import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  console.log('Creating Rare Tea Cellar vendor...');

  const { data, error } = await supabase
    .from('vendors')
    .insert({
      name: 'Rare Tea Cellar',
      normalized_name: 'rare tea cellar',
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✅ Created vendor:', data);
  }
})();
