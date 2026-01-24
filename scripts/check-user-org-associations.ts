import { createClient } from '@supabase/supabase-js';

async function checkUserOrgs() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userId = '0121ec40-8732-4ff3-8a50-a866137edf17';

  console.log('Checking user:', userId);

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  console.log('User:', user);

  const { data: orgUsers, error: orgError } = await supabase
    .from('organization_users')
    .select('*, organizations(*)')
    .eq('user_id', userId);

  console.log('Organization associations:', orgUsers);
  console.log('Error:', orgError);

  // Also check all orgs
  const { data: allOrgs } = await supabase
    .from('organizations')
    .select('*');

  console.log('All organizations:', allOrgs);
}

checkUserOrgs();
