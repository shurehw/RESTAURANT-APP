#!/usr/bin/env node

/**
 * Provision a Host Stand User
 *
 * Creates (or reuses) an auth user and links them to a venue
 * for host stand iPad access.
 *
 * Usage:
 *   node scripts/provision-host-stand-user.mjs \
 *     --email host@venue.com \
 *     --name "Emily - Host" \
 *     --venue-id <uuid> \
 *     --org-id <uuid>
 *
 * Or edit the defaults below and run:
 *   node scripts/provision-host-stand-user.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { parseArgs } from 'node:util';

config({ path: '.env' });
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Parse Args ───────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    email:    { type: 'string' },
    name:     { type: 'string' },
    'venue-id': { type: 'string' },
    'org-id':   { type: 'string' },
    password: { type: 'string' },
  },
  strict: false,
});

const EMAIL = values.email;
const DISPLAY_NAME = values.name || 'Host Stand';
const VENUE_ID = values['venue-id'];
const ORG_ID = values['org-id'];
const PASSWORD = values.password || `Host${Math.random().toString(36).slice(-8)}!`;

if (!EMAIL || !VENUE_ID || !ORG_ID) {
  console.error(`
Usage:
  node scripts/provision-host-stand-user.mjs \\
    --email host@venue.com \\
    --name "Emily - Host" \\
    --venue-id <uuid> \\
    --org-id <uuid> \\
    [--password MyPassword123!]
  `);
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\nProvisioning host stand user...`);
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Name:     ${DISPLAY_NAME}`);
  console.log(`  Venue:    ${VENUE_ID}`);
  console.log(`  Org:      ${ORG_ID}\n`);

  // 1. Verify venue exists
  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .select('id, name')
    .eq('id', VENUE_ID)
    .single();

  if (venueErr || !venue) {
    console.error('Venue not found:', VENUE_ID);
    process.exit(1);
  }
  console.log(`  Venue name: ${venue.name}`);

  // 2. Check if auth user exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  let authUserId;
  const existing = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === EMAIL.toLowerCase(),
  );

  if (existing) {
    authUserId = existing.id;
    console.log(`  Auth user exists: ${authUserId}`);
  } else {
    // Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: DISPLAY_NAME },
    });

    if (authError) {
      console.error('Failed to create auth user:', authError.message);
      process.exit(1);
    }
    authUserId = authUser.user.id;
    console.log(`  Created auth user: ${authUserId}`);
  }

  // 3. Ensure organization_users row (role: pwa)
  const { error: orgErr } = await supabase
    .from('organization_users')
    .upsert(
      {
        user_id: authUserId,
        organization_id: ORG_ID,
        role: 'pwa',
        is_active: true,
        venue_ids: [VENUE_ID],
      },
      { onConflict: 'organization_id,user_id' },
    );

  if (orgErr) {
    console.error('Failed to link to org:', orgErr.message);
    process.exit(1);
  }
  console.log(`  Linked to org (role: pwa)`);

  // 4. Create host_stand_users row
  const { error: hsErr } = await supabase
    .from('host_stand_users')
    .upsert(
      {
        user_id: authUserId,
        org_id: ORG_ID,
        venue_id: VENUE_ID,
        display_name: DISPLAY_NAME,
        is_active: true,
      },
      { onConflict: 'user_id,venue_id' },
    );

  if (hsErr) {
    console.error('Failed to create host_stand_users row:', hsErr.message);
    process.exit(1);
  }
  console.log(`  Created host_stand_users row`);

  // Done
  console.log(`\n✓ Host stand user provisioned successfully!\n`);
  console.log(`  Login URL:  https://your-domain.com/host-stand/login`);
  console.log(`  Email:      ${EMAIL}`);
  if (!existing) {
    console.log(`  Password:   ${PASSWORD}`);
  }
  console.log(`  Venue:      ${venue.name}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
