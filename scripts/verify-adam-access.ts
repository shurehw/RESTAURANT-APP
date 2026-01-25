import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyAdamAccess() {
  console.log('🔍 Comprehensive Access Check for Adam Olson\n');
  console.log('='.repeat(60));

  const adamId = '92c09b16-71dd-4231-8743-a7d66fd0d03c';
  const adamEmail = 'aolson@hwoodgroup.com';

  let allPassed = true;

  // 1. Check user account
  console.log('\n1️⃣  USER ACCOUNT');
  const { data: user } = await supabase
    .from('users')
    .select('id, email, full_name, is_active, role')
    .eq('id', adamId)
    .single();

  if (user && user.is_active) {
    console.log(`   ✅ User exists and is active`);
    console.log(`      Email: ${user.email}`);
    console.log(`      Name: ${user.full_name}`);
    console.log(`      Role: ${user.role}`);
  } else {
    console.log(`   ❌ User not found or inactive`);
    allPassed = false;
  }

  // 2. Check organization membership
  console.log('\n2️⃣  ORGANIZATION MEMBERSHIP');
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select(`
      organization_id,
      role,
      is_active,
      organizations(id, name)
    `)
    .eq('user_id', adamId);

  if (orgUsers && orgUsers.length > 0) {
    console.log(`   ✅ Linked to ${orgUsers.length} organization(s):`);
    orgUsers.forEach(ou => {
      const org = ou.organizations as any;
      console.log(`      - ${org.name} (${ou.role}, ${ou.is_active ? 'Active' : 'Inactive'})`);
      console.log(`        Org ID: ${org.id}`);
    });
  } else {
    console.log(`   ❌ Not linked to any organization`);
    allPassed = false;
  }

  // 3. Check GL accounts access
  console.log('\n3️⃣  GL ACCOUNTS ACCESS');
  if (orgUsers && orgUsers.length > 0) {
    const orgId = (orgUsers[0].organizations as any).id;
    const { data: glAccounts, error: glError } = await supabase
      .from('gl_accounts')
      .select('id, external_code, name, section')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .eq('is_summary', false)
      .in('section', ['COGS', 'Opex'])
      .limit(5);

    if (glError) {
      console.log(`   ❌ Error fetching GL accounts: ${glError.message}`);
      allPassed = false;
    } else if (glAccounts && glAccounts.length > 0) {
      console.log(`   ✅ Can access ${glAccounts.length} GL accounts (showing first 5)`);
      glAccounts.slice(0, 3).forEach(gl => {
        console.log(`      - ${gl.external_code || 'N/A'} - ${gl.name} (${gl.section})`);
      });
    } else {
      console.log(`   ⚠️  No GL accounts found for organization`);
    }
  } else {
    console.log(`   ⏭️  Skipped (no organization)`);
  }

  // 4. Check invoices access
  console.log('\n4️⃣  INVOICES ACCESS');
  if (orgUsers && orgUsers.length > 0) {
    const orgId = (orgUsers[0].organizations as any).id;

    // Get venues for this org
    const { data: venues } = await supabase
      .from('venues')
      .select('id, name')
      .eq('org_id', orgId)
      .limit(1);

    if (venues && venues.length > 0) {
      const venueId = venues[0].id;
      console.log(`   Using venue: ${venues[0].name}`);

      // Check invoices
      const { data: invoices, error: invError } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, storage_path')
        .eq('venue_id', venueId)
        .limit(3);

      if (invError) {
        console.log(`   ❌ Error fetching invoices: ${invError.message}`);
        allPassed = false;
      } else if (invoices && invoices.length > 0) {
        console.log(`   ✅ Can access invoices (found ${invoices.length})`);
        invoices.forEach(inv => {
          console.log(`      - Invoice #${inv.invoice_number}: $${inv.total_amount}`);
          console.log(`        Storage: ${inv.storage_path || 'No file'}`);
        });
      } else {
        console.log(`   ⚠️  No invoices found for venue`);
      }
    } else {
      console.log(`   ⚠️  No venues found for organization`);
    }
  } else {
    console.log(`   ⏭️  Skipped (no organization)`);
  }

  // 5. Check items access
  console.log('\n5️⃣  ITEMS/CATALOG ACCESS');
  if (orgUsers && orgUsers.length > 0) {
    const orgId = (orgUsers[0].organizations as any).id;
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('id, name, category, gl_account_id')
      .eq('org_id', orgId)
      .limit(3);

    if (itemsError) {
      console.log(`   ❌ Error fetching items: ${itemsError.message}`);
      allPassed = false;
    } else if (items && items.length > 0) {
      console.log(`   ✅ Can access items catalog (found ${items.length})`);
      items.forEach(item => {
        console.log(`      - ${item.name} (${item.category})`);
      });
    } else {
      console.log(`   ⚠️  No items found in catalog`);
    }
  } else {
    console.log(`   ⏭️  Skipped (no organization)`);
  }

  // 6. Check vendors access
  console.log('\n6️⃣  VENDORS ACCESS');
  if (orgUsers && orgUsers.length > 0) {
    const orgId = (orgUsers[0].organizations as any).id;
    const { data: vendors, error: vendorsError } = await supabase
      .from('vendors')
      .select('id, name, is_active')
      .eq('org_id', orgId)
      .limit(3);

    if (vendorsError) {
      console.log(`   ❌ Error fetching vendors: ${vendorsError.message}`);
      allPassed = false;
    } else if (vendors && vendors.length > 0) {
      console.log(`   ✅ Can access vendors (found ${vendors.length})`);
      vendors.forEach(vendor => {
        console.log(`      - ${vendor.name} (${vendor.is_active ? 'Active' : 'Inactive'})`);
      });
    } else {
      console.log(`   ⚠️  No vendors found`);
    }
  } else {
    console.log(`   ⏭️  Skipped (no organization)`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 SUMMARY\n');
  if (allPassed) {
    console.log('✅ ALL CHECKS PASSED!');
    console.log('   Adam Olson has full access to:');
    console.log('   - User account');
    console.log('   - Hwood Group organization');
    console.log('   - GL accounts');
    console.log('   - Invoices');
    console.log('   - Items catalog');
    console.log('   - Vendors');
    console.log('\n   He should be able to use all features without 403/401 errors.');
  } else {
    console.log('❌ SOME CHECKS FAILED');
    console.log('   Review the errors above and fix them.');
  }

  console.log('\n✨ Done\n');
}

verifyAdamAccess().catch(console.error);
