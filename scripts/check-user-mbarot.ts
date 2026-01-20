import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  console.log('Checking for mbarot@hwoodgroup.com...\n');

  // Use admin API to list users
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    console.error('Error listing users:', error);
    return;
  }

  const user = data.users.find(u => u.email === 'mbarot@hwoodgroup.com');

  if (user) {
    console.log('✓ User found:', user.email);
    console.log('  User ID:', user.id);
    console.log('  Created:', user.created_at);
    console.log('  Metadata:', user.user_metadata);
  } else {
    console.log('❌ User not found');
    console.log('\nOptions:');
    console.log('1. Invite them via Supabase Dashboard:');
    console.log('   https://mnraeesscqsaappkaldb.supabase.co/project/mnraeesscqsaappkaldb/auth/users');
    console.log('2. Have them sign up at your app');
  }
}

main();
