import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runMigration() {
  console.log('Running migration 131_add_r365_fields_to_items.sql...\n');

  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/131_add_r365_fields_to_items.sql'),
    'utf8'
  );

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    // Try direct execution
    console.log('Trying direct column adds...\n');

    const columns = [
      'r365_measure_type TEXT',
      'r365_reporting_uom TEXT',
      'r365_inventory_uom TEXT',
      'r365_cost_account TEXT',
      'r365_inventory_account TEXT',
      'r365_cost_update_method TEXT',
      'r365_key_item BOOLEAN DEFAULT false'
    ];

    for (const col of columns) {
      const colName = col.split(' ')[0];
      const { error: addError } = await supabase.rpc('exec_sql', {
        sql_query: `ALTER TABLE items ADD COLUMN IF NOT EXISTS ${col};`
      });

      if (addError) {
        console.log(`Column ${colName}:`, addError.message.includes('already exists') ? 'already exists ✓' : `error: ${addError.message}`);
      } else {
        console.log(`Column ${colName}: added ✓`);
      }
    }
  } else {
    console.log('✅ Migration completed successfully!');
  }
}

runMigration();
