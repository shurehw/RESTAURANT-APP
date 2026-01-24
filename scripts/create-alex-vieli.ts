import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      name: 'Alex Vieli',
      normalized_name: 'alex vieli',
    })
    .select()
    .single();

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('✅ Created Alex Vieli');
  }
})();
