import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as https from 'https';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1];

async function runDirectSQL(sql: string) {
  const url = `https://${projectRef}.supabase.co/rest/v1/rpc/exec_raw_sql`;

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data || '{}')));
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query: sql }));
    req.end();
  });
}

async function migrate() {
  try {
    console.log('Step 1: Adding column...');
    await runDirectSQL(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
    `);

    console.log('Step 2: Backfilling data...');
    await runDirectSQL(`
      UPDATE invoices i
      SET organization_id = v.organization_id
      FROM venues v
      WHERE i.venue_id = v.id
      AND i.organization_id IS NULL;
    `);

    console.log('Step 3: Making NOT NULL...');
    await runDirectSQL(`
      ALTER TABLE invoices
      ALTER COLUMN organization_id SET NOT NULL;
    `);

    console.log('Step 4: Adding index...');
    await runDirectSQL(`
      CREATE INDEX IF NOT EXISTS idx_invoices_organization_id
      ON invoices(organization_id);
    `);

    console.log('✓ Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();
