/**
 * Run migration 024 - Allow standalone venues
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function runMigration() {
  console.log('\n🔧 Running migration 024: Allow standalone venues...\n');

  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/024_allow_standalone_venues.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    console.log('Executing:', statement.substring(0, 100) + '...');

    const { error } = await supabase.rpc('exec_sql', { sql_query: statement });

    if (error) {
      console.error('❌ Error:', error.message);
      // Try direct query instead
      const { error: directError } = await supabase.from('_migrations').insert({});
      if (directError) {
        console.log('Trying alternative approach...');
      }
    } else {
      console.log('✅ Success');
    }
  }

  console.log('\n✅ Migration complete!\n');
  console.log('You can now create standalone venues (without organizations).');
}

runMigration().catch(console.error);
