import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function runSQL() {
  // Step 1: Add column if it doesn't exist
  console.log('Adding organization_id column...');
  const { error: addColError } = await supabase.rpc('exec_raw_sql', {
    query: 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);'
  });

  if (addColError) console.log('Add column result:', addColError);

  // Step 2: Backfill from venue
  console.log('Backfilling organization_id from venues...');
  const { error: backfillError } = await supabase.rpc('exec_raw_sql', {
    query: `
      UPDATE invoices i
      SET organization_id = v.organization_id
      FROM venues v
      WHERE i.venue_id = v.id
      AND i.organization_id IS NULL;
    `
  });

  if (backfillError) console.log('Backfill result:', backfillError);

  // Step 3: Make it NOT NULL
  console.log('Making organization_id NOT NULL...');
  const { error: notNullError } = await supabase.rpc('exec_raw_sql', {
    query: 'ALTER TABLE invoices ALTER COLUMN organization_id SET NOT NULL;'
  });

  if (notNullError) console.log('NOT NULL result:', notNullError);

  // Step 4: Add index
  console.log('Adding index...');
  const { error: indexError } = await supabase.rpc('exec_raw_sql', {
    query: 'CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON invoices(organization_id);'
  });

  if (indexError) console.log('Index result:', indexError);

  console.log('✓ Done');
}

runSQL();
