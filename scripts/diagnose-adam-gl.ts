#!/usr/bin/env node
/**
 * Diagnose Adam's GL Account Issue
 * Check exactly what data is being queried and returned
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function diagnoseAdam() {
  const adamEmail = 'aolson@hwoodgroup.com';
  const jacobEmail = 'jacob@hwoodgroup.com';

  console.log('\n=== Adam GL Account Diagnosis ===\n');

  // 1. Get Adam's user record
  console.log('1. Fetching Adam user record...');
  const { data: adamUser, error: adamUserError } = await supabase
    .from('users')
    .select('*')
    .eq('email', adamEmail)
    .single();

  if (adamUserError || !adamUser) {
    console.error('❌ Failed to fetch Adam:', adamUserError);
    return;
  }

  console.log('✓ Adam user:', {
    id: adamUser.id,
    email: adamUser.email,
    full_name: adamUser.full_name,
    is_active: adamUser.is_active
  });

  // 2. Get Adam's organization memberships
  console.log('\n2. Fetching Adam organization memberships...');
  const { data: adamOrgs, error: adamOrgsError } = await supabase
    .from('organization_users')
    .select(`
      organization_id,
      role,
      is_active,
      organizations (
        id,
        name
      )
    `)
    .eq('user_id', adamUser.id);

  if (adamOrgsError) {
    console.error('❌ Failed to fetch orgs:', adamOrgsError);
    return;
  }

  console.log('✓ Adam organizations:', adamOrgs);

  if (!adamOrgs || adamOrgs.length === 0) {
    console.error('❌ Adam has no organization memberships!');
    return;
  }

  const activeAdamOrgs = adamOrgs.filter(o => o.is_active);
  if (activeAdamOrgs.length === 0) {
    console.error('❌ Adam has no ACTIVE organization memberships!');
    return;
  }

  const adamOrgId = activeAdamOrgs[0].organization_id;
  console.log(`✓ Using org ID: ${adamOrgId}`);

  // 3. Check GL accounts for Adam's org
  console.log('\n3. Checking GL accounts for Adam\'s org...');
  const { data: allGL, error: allGLError } = await supabase
    .from('gl_accounts')
    .select('*')
    .eq('org_id', adamOrgId);

  if (allGLError) {
    console.error('❌ Failed to fetch GL accounts:', allGLError);
    return;
  }

  console.log(`✓ Total GL accounts: ${allGL?.length || 0}`);

  // 4. Check COGS & Opex GL accounts (what the API returns)
  const cogsOpexAccounts = allGL?.filter(
    gl => gl.is_active && !gl.is_summary && (gl.section === 'COGS' || gl.section === 'Opex')
  ) || [];

  console.log(`✓ COGS & Opex GL accounts (active, non-summary): ${cogsOpexAccounts.length}`);

  // 5. Compare with Jacob's setup
  console.log('\n4. Comparing with Jacob\'s setup...');
  const { data: jacobUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', jacobEmail)
    .single();

  if (jacobUser) {
    const { data: jacobOrgs } = await supabase
      .from('organization_users')
      .select('organization_id, is_active')
      .eq('user_id', jacobUser.id)
      .eq('is_active', true);

    console.log('✓ Jacob organizations:', jacobOrgs);

    if (jacobOrgs && jacobOrgs.length > 0) {
      const jacobOrgId = jacobOrgs[0].organization_id;
      console.log(`✓ Jacob org ID: ${jacobOrgId}`);
      console.log(`✓ Same org as Adam? ${jacobOrgId === adamOrgId ? 'YES' : 'NO'}`);

      if (jacobOrgId === adamOrgId) {
        console.log('\n✅ Both users in same organization!');
      } else {
        console.log('\n❌ PROBLEM: Users in different organizations!');
        console.log(`   Adam:  ${adamOrgId}`);
        console.log(`   Jacob: ${jacobOrgId}`);
      }
    }
  }

  // 6. Sample GL accounts
  console.log('\n5. Sample GL accounts (first 5):');
  cogsOpexAccounts.slice(0, 5).forEach((gl, idx) => {
    console.log(`   ${idx + 1}. ${gl.external_code} - ${gl.name} (${gl.section})`);
  });

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Adam User ID: ${adamUser.id}`);
  console.log(`Adam Org ID: ${adamOrgId}`);
  console.log(`GL Accounts Available: ${cogsOpexAccounts.length}`);

  if (cogsOpexAccounts.length > 0) {
    console.log('\n✅ Data exists! Issue may be in API auth/RLS.');
  } else {
    console.log('\n❌ No GL accounts found. Data issue.');
  }
}

diagnoseAdam().catch(console.error);
