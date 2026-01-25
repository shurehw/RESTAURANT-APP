import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function migrate() {
  const sql = fs.readFileSync('supabase/migrations/1001_add_organization_id_to_invoices.sql', 'utf8');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Split into individual statements and execute
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (const statement of statements) {
    console.log('Executing:', statement.substring(0, 80) + '...');
    const { error } = await supabase.rpc('exec_sql', { sql_string: statement + ';' });
    if (error) {
      console.error('Error:', error);
    }
  }

  console.log('✓ Migration completed');
}

migrate();
