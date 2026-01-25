import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Construct Supabase direct database URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1];
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use Supabase's pooler connection
const connectionString = `postgres://postgres.${projectRef}:${serviceRoleKey}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

const sql = postgres(connectionString);

async function migrate() {
  try {
    console.log('Adding organization_id column to invoices...');

    await sql`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id)
    `;

    console.log('Backfilling organization_id from venues...');
    await sql`
      UPDATE invoices i
      SET organization_id = v.organization_id
      FROM venues v
      WHERE i.venue_id = v.id
      AND i.organization_id IS NULL
    `;

    console.log('Making organization_id NOT NULL...');
    await sql`
      ALTER TABLE invoices
      ALTER COLUMN organization_id SET NOT NULL
    `;

    console.log('Adding index...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_invoices_organization_id
      ON invoices(organization_id)
    `;

    console.log('✓ Migration complete');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sql.end();
  }
}

migrate();
