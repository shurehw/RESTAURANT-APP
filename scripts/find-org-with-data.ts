import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findOrgWithData() {
  console.log('🔍 Finding organizations with actual data\n');

  // Get all organizations
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name');

  if (!orgs) {
    console.log('No organizations found');
    return;
  }

  console.log(`Found ${orgs.length} organizations:\n`);

  for (const org of orgs) {
    console.log(`📊 ${org.name} (${org.id})`);

    // Check data counts
    const { count: venuesCount } = await supabase
      .from('venues')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id);

    const { count: glCount } = await supabase
      .from('gl_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org.id);

    const { count: itemsCount } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id);

    const { count: vendorsCount } = await supabase
      .from('vendors')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id);

    const { count: invoicesCount } = await supabase
      .from('invoices')
      .select('invoices.id', { count: 'exact', head: true })
      .eq('invoices.organization_id', org.id);

    console.log(`   Venues: ${venuesCount || 0}`);
    console.log(`   GL Accounts: ${glCount || 0}`);
    console.log(`   Items: ${itemsCount || 0}`);
    console.log(`   Vendors: ${vendorsCount || 0}`);
    console.log(`   Invoices: ${invoicesCount || 0}`);

    const hasData = (venuesCount || 0) > 0 || (glCount || 0) > 0 || (itemsCount || 0) > 0;
    if (hasData) {
      console.log(`   ✅ HAS DATA!`);
    } else {
      console.log(`   ⚠️  Empty`);
    }
    console.log('');
  }

  console.log('\n✨ Done');
}

findOrgWithData().catch(console.error);
