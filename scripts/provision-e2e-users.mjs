/**
 * Provision E2E test users for Playwright tests.
 * Run: node scripts/provision-e2e-users.mjs
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const E2E_PASSWORD = 'E2eTest!2026';
const DASH_EMAIL = 'e2e-dashboard@opsos.test';
const MANAGER_EMAIL = 'e2e-manager@opsos.test';
const VENDOR_EMAIL = 'e2e-vendor@opsos.test';
const HOST_EMAIL = 'e2e-host@opsos.test';
const VENUE_ID = '22222222-2222-2222-2222-222222222222'; // Nice Guy LA

async function ensureAuthUser(email, password) {
  // Try to create first
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) {
    console.log(`  Created new auth user: ${data.user.id}`);
    return data.user.id;
  }

  if (error.code !== 'email_exists') throw error;

  // User exists in auth — look up their ID from our users table
  const { data: row } = await sb.from('users').select('id').eq('email', email).single();
  if (row) {
    await sb.auth.admin.updateUserById(row.id, { password });
    console.log(`  Updated existing auth user (from users table): ${row.id}`);
    return row.id;
  }

  // Not in our users table either — sign in to get the ID
  const { data: signIn, error: signErr } = await sb.auth.signInWithPassword({ email, password });
  if (!signErr && signIn?.user) {
    console.log(`  Found via sign-in: ${signIn.user.id}`);
    return signIn.user.id;
  }

  // Last resort: try signing in with a dummy password, which will fail but
  // we can try to delete and recreate
  throw new Error(`User ${email} exists in auth but cannot be located. Delete manually in Supabase dashboard.`);
}

async function main() {
  const hash = await bcrypt.hash(E2E_PASSWORD, 10);

  // Get org_id from venues table
  const { data: ref } = await sb
    .from('venues')
    .select('organization_id')
    .eq('id', VENUE_ID)
    .single();
  const orgId = ref.organization_id;

  // -- Dashboard user --
  const dashId = await ensureAuthUser(DASH_EMAIL, E2E_PASSWORD);
  console.log('Dashboard auth user:', dashId);

  const { error: e1 } = await sb.from('users').upsert(
    {
      id: dashId,
      email: DASH_EMAIL,
      password_hash: hash,
      role: 'owner',
      is_active: true,
      full_name: 'E2E Dashboard',
    },
    { onConflict: 'id' }
  );
  if (e1) throw e1;
  console.log('Dashboard custom user OK');

  // -- Manager user --
  const managerId = await ensureAuthUser(MANAGER_EMAIL, E2E_PASSWORD);
  console.log('Manager auth user:', managerId);

  const { error: eManager } = await sb.from('users').upsert(
    {
      id: managerId,
      email: MANAGER_EMAIL,
      password_hash: hash,
      role: 'manager',
      is_active: true,
      full_name: 'E2E Manager',
    },
    { onConflict: 'id' }
  );
  if (eManager) throw eManager;
  console.log('Manager custom user OK');

  // -- Vendor user --
  const vendorId = await ensureAuthUser(VENDOR_EMAIL, E2E_PASSWORD);
  console.log('Vendor auth user:', vendorId);

  const { error: eVendor } = await sb.from('users').upsert(
    {
      id: vendorId,
      email: VENDOR_EMAIL,
      password_hash: hash,
      role: 'readonly',
      is_active: true,
      full_name: 'E2E Vendor',
    },
    { onConflict: 'id' }
  );
  if (eVendor) throw eVendor;
  console.log('Vendor custom user OK');

  // -- Host stand user --
  const hostId = await ensureAuthUser(HOST_EMAIL, E2E_PASSWORD);
  console.log('Host auth user:', hostId);

  const { error: e2 } = await sb.from('users').upsert(
    {
      id: hostId,
      email: HOST_EMAIL,
      password_hash: hash,
      role: 'pwa',
      is_active: true,
      full_name: 'E2E Host',
    },
    { onConflict: 'id' }
  );
  if (e2) throw e2;
  console.log('Host custom user OK');

  // -- Org memberships for all e2e users --
  const membershipRows = [
    {
      user_id: dashId,
      organization_id: orgId,
      role: 'owner',
      is_active: true,
      venue_ids: [VENUE_ID],
    },
    {
      user_id: managerId,
      organization_id: orgId,
      role: 'manager',
      is_active: true,
      venue_ids: [VENUE_ID],
    },
    {
      user_id: vendorId,
      organization_id: orgId,
      role: 'viewer',
      is_active: true,
      venue_ids: [VENUE_ID],
    },
    {
      user_id: hostId,
      organization_id: orgId,
      role: 'pwa',
      is_active: true,
      venue_ids: [VENUE_ID],
    },
  ];

  const { error: membershipErr } = await sb
    .from('organization_users')
    .upsert(membershipRows, { onConflict: 'organization_id,user_id' });
  if (membershipErr) throw membershipErr;
  console.log('organization_users memberships OK');

  // -- host_stand_users entry --
  // Delete any existing entry for this user+venue, then insert fresh
  await sb.from('host_stand_users').delete().eq('user_id', hostId).eq('venue_id', VENUE_ID);
  const { error: e3 } = await sb.from('host_stand_users').insert({
    user_id: hostId,
    venue_id: VENUE_ID,
    display_name: 'E2E Host',
    org_id: orgId,
    is_active: true,
  });
  if (e3) throw e3;
  console.log('host_stand_users OK');

  console.log('\n--- Add to .env ---');
  console.log(`E2E_DASHBOARD_EMAIL=${DASH_EMAIL}`);
  console.log(`E2E_DASHBOARD_PASSWORD=${E2E_PASSWORD}`);
  console.log(`E2E_MANAGER_EMAIL=${MANAGER_EMAIL}`);
  console.log(`E2E_MANAGER_PASSWORD=${E2E_PASSWORD}`);
  console.log(`E2E_VENDOR_EMAIL=${VENDOR_EMAIL}`);
  console.log(`E2E_VENDOR_PASSWORD=${E2E_PASSWORD}`);
  console.log(`E2E_HOST_EMAIL=${HOST_EMAIL}`);
  console.log(`E2E_HOST_PASSWORD=${E2E_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
