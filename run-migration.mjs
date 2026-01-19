import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const sql = readFileSync('supabase/migrations/082_add_space_planning_fields.sql', 'utf8');

console.log('Executing migration...');
const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

if (error) {
  console.error('Error:', error);

  // Try alternative method - direct SQL execution
  console.log('\nTrying direct execution...');
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({ query: sql })
  });

  const result = await response.json();
  console.log('Result:', result);
} else {
  console.log('Success!', data);
}
