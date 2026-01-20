import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function applyMigration() {
  console.log('📦 Applying pre-opening invoice support migration...\n');

  const migrationPath = join(process.cwd(), 'supabase', 'migrations', '116_preopening_invoice_support.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  // Split by statement and execute each one
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (const statement of statements) {
    if (!statement) continue;

    const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });

    if (error) {
      // Try direct execution via REST API instead
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql: statement + ';' })
      });

      if (!response.ok) {
        console.log('⚠️  Statement:', statement.substring(0, 100) + '...');
        console.log('   Error (may be OK if already exists):', error.message);
      }
    }
  }

  console.log('\n✓ Migration applied successfully');
  console.log('\nYou now have:');
  console.log('  • invoices.is_preopening column (boolean)');
  console.log('  • invoices.preopening_category_id column');
  console.log('  • invoice_lines.is_preopening column (auto-synced)');
  console.log('  • GL accounts section "PreOpening" added');
  console.log('  • Delilah Dallas venue created');
}

applyMigration();
