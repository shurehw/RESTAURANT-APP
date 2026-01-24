import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getOrgId() {
  const { data: items } = await supabase
    .from('items')
    .select('organization_id')
    .limit(1);

  if (items && items.length > 0) {
    console.log(items[0].organization_id);
  }
}

getOrgId();
