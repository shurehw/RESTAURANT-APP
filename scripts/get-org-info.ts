import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getOrgInfo() {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .limit(5);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('\nOrganizations:');
  data?.forEach(org => {
    console.log(`  ${org.name}: ${org.id}`);
  });
}

getOrgInfo();
