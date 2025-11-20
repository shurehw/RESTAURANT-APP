import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://mnraeesscqsaappkaldb.supabase.co',
  'SUPABASE_SERVICE_ROLE_KEY_REDACTED'
);

const sql = readFileSync('supabase/migrations/060_add_ocr_raw_json.sql', 'utf-8');

// Execute line by line
const lines = sql.split(';').filter(l => l.trim() && !l.trim().startsWith('--'));

for (const line of lines) {
  if (!line.trim()) continue;
  console.log('Executing:', line.trim().substring(0, 50) + '...');
  const { error } = await supabase.from('_migrations').select('*').limit(0) as any;
  // We'll use raw SQL through a different approach
}

console.log('\nPlease run this SQL in Supabase Dashboard SQL Editor:\n');
console.log(sql);
