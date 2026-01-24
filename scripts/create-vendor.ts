import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%hwood%')
    .single();

  console.log('Creating vendor for organization:', org?.name);

  const { data, error } = await supabase
    .from('vendors')
    .insert({
      name: 'Rare Tea Cellar',
      organization_id: org?.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Created vendor:', data);
  }
})();
