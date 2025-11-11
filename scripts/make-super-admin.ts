/**
 * Make a user a super admin
 * Usage: npx tsx scripts/make-super-admin.ts your-email@example.com
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'set' : 'missing');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'set' : 'missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function makeSuperAdmin(email: string) {
  console.log(`\nMaking ${email} a super admin...\n`);

  // Get user by email
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();

  if (userError) {
    console.error('Error fetching users:', userError);
    return;
  }

  const user = users.users.find(u => u.email === email);

  if (!user) {
    console.error(`User with email ${email} not found.`);
    console.log('\nAvailable users:');
    users.users.forEach(u => console.log(`  - ${u.email}`));
    return;
  }

  console.log(`Found user: ${user.email} (${user.id})`);

  // Insert into super_admins table
  const { data, error } = await supabase
    .from('super_admins')
    .insert({
      user_id: user.id,
      notes: 'Initial super admin',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      console.log('✅ User is already a super admin');
    } else {
      console.error('Error making super admin:', error);
    }
    return;
  }

  console.log('✅ Successfully granted super admin access!');
  console.log(data);
}

const email = process.argv[2];

if (!email) {
  console.error('Usage: npx tsx scripts/make-super-admin.ts your-email@example.com');
  process.exit(1);
}

makeSuperAdmin(email);
