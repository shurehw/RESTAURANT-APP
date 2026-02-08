import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function linkUserToOrg() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41'; // The h.wood Group
  const userId = '26b7cf8e-76de-42a6-a62c-cca54c374137'; // haggarwal@hwoodgroup.com

  console.log('Linking user to org as owner...');
  console.log('User ID:', userId);
  console.log('Org ID:', orgId);

  // Update existing record to owner, or insert new
  const { data, error } = await supabase
    .from('organization_users')
    .upsert({
      user_id: userId,
      organization_id: orgId,
      role: 'owner',
      is_active: true,
    }, { onConflict: 'organization_id,user_id' })
    .select();

  if (error) {
    console.error('Error:', error.message, error);
  } else {
    console.log('Success!', data);
  }

  // Verify
  const { data: check } = await supabase
    .from('organization_users')
    .select('user_id, organization_id, role, is_active')
    .eq('user_id', userId);
  console.log('Verification:', check);
}

linkUserToOrg();
