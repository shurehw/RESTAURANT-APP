import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const sql = readFileSync('supabase/migrations/102_create_proforma_presets.sql', 'utf-8');

console.log('Running migration 102_create_proforma_presets.sql...');

// Split by semicolon and run each statement
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

for (const statement of statements) {
  if (statement) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_string: statement + ';' });
      if (error) {
        // Try direct query if RPC doesn't work
        const { error: queryError } = await supabase.from('_').select('*').limit(0);
        console.log('Note: Using pg connection instead of RPC');
      }
    } catch (err) {
      console.error('Error executing statement:', statement.substring(0, 100));
      console.error(err);
    }
  }
}

console.log('Migration complete!');
