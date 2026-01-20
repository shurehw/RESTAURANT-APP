import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('Updating create_invoice_with_lines function to support is_preopening...');

  const sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/122_update_invoice_function_preopening.sql'),
    'utf-8'
  );

  const { error } = await supabase.rpc('exec_sql', { sql_string: sql });

  if (error) {
    console.error('Error updating function:', error);
    process.exit(1);
  }

  console.log('✓ Function updated successfully');
}

main();
