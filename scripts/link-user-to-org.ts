import { createClient } from '@supabase/supabase-js';

async function linkUserToOrg() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userId = '0121ec40-8732-4ff3-8a50-a866137edf17';
  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41'; // The h.wood Group

  console.log('Linking user to organization...');
  console.log('User ID:', userId);
  console.log('Org ID:', orgId);

  const { data, error } = await supabase
    .from('organization_users')
    .insert({
      user_id: userId,
      organization_id: orgId,
      role: 'admin',
      is_active: true
    })
    .select();

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! Created association:', data);
  }
}

linkUserToOrg();
