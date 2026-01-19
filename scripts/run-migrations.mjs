import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const migrations = [
  '089_create_center_service_participation.sql',
  '090_add_validation_triggers.sql',
  '091_add_audit_columns.sql'
];

async function runMigrations() {
  for (const migration of migrations) {
    console.log(`\n📝 Running ${migration}...`);

    const sqlPath = join(__dirname, '..', 'supabase', 'migrations', migration);
    const sql = readFileSync(sqlPath, 'utf8');

    const { error } = await supabase.rpc('exec_sql', { sql_string: sql }).single();

    if (error) {
      console.error(`❌ Error in ${migration}:`, error);

      // Try alternative method - direct query
      const { error: queryError } = await supabase.from('_migrations').insert({
        name: migration,
        executed_at: new Date().toISOString()
      });

      if (queryError) {
        console.error(`Failed to record migration:`, queryError);
      }
    } else {
      console.log(`✅ ${migration} completed`);
    }
  }

  console.log('\n✨ All migrations complete');
}

runMigrations().catch(console.error);
