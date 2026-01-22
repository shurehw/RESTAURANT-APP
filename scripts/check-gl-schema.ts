import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkGLSchema() {
  // Get a sample GL account record to see the schema
  const { data, error } = await supabase
    .from('gl_accounts')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nGL Account schema (sample record):');
  console.log(JSON.stringify(data?.[0], null, 2));
}

checkGLSchema().catch(console.error);
