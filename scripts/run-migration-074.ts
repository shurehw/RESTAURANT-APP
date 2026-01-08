import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  const sql = fs.readFileSync('supabase/migrations/074_create_preopening_monthly.sql', 'utf8');

  console.log('Running migration 074_create_preopening_monthly.sql...\n');

  // Split by semicolon and filter out empty statements and comments
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && s.length > 0);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    
    // Skip standalone comments
    if (stmt.startsWith('--')) continue;
    
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    console.log(stmt.substring(0, 100) + (stmt.length > 100 ? '...' : ''));
    
    try {
      // Use RPC to execute SQL
      let data, error;
      try {
        const result = await supabase.rpc('exec_sql', { 
          sql_query: stmt + ';' 
        });
        data = result.data;
        error = result.error;
      } catch (err: any) {
        // If exec_sql doesn't exist, try direct query
        // For Supabase, we need to use the REST API or a different approach
        data = null;
        error = err;
      }

      if (error) {
        // Try alternative: execute via REST API using a custom function
        // Or use pg directly
        console.warn('RPC method failed, trying alternative approach...');
        console.error('Error:', error.message);
        
        // For now, we'll need to execute this manually or use a different method
        console.log('\n⚠️  Could not execute automatically.');
        console.log('Please run this SQL in Supabase Dashboard SQL Editor:\n');
        console.log(sql);
        return;
      } else {
        console.log('✓ Success\n');
      }
    } catch (err: any) {
      console.error('Error executing statement:', err.message);
      console.log('\n⚠️  Migration execution failed.');
      console.log('Please run this SQL manually in Supabase Dashboard SQL Editor:\n');
      console.log(sql);
      return;
    }
  }

  console.log('\n✅ Migration completed successfully!');
}

runMigration().catch((error) => {
  console.error('Fatal error:', error);
  console.log('\n⚠️  Please run the migration manually in Supabase Dashboard SQL Editor.');
  process.exit(1);
});

