import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  const sql = fs.readFileSync('supabase/migrations/075_add_day_of_week_distribution.sql', 'utf8');

  console.log('Running migration...');
  console.log(sql);

  // Split by semicolon and run each statement
  const statements = sql.split(';').filter(s => s.trim());

  for (const stmt of statements) {
    if (!stmt.trim()) continue;
    console.log('\nExecuting:', stmt.trim().substring(0, 100) + '...');

    const { data, error } = await supabase.rpc('query', {
      query_text: stmt.trim()
    });

    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Success:', data);
    }
  }
}

runMigration().catch(console.error);
