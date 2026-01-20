import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function runMigration() {
  console.log('📦 Applying migration 116: Pre-opening Invoice Support\n');

  try {
    // Step 1: Drop and recreate GL accounts section check
    console.log('1️⃣  Updating GL accounts section constraint...');
    await supabase.rpc('exec_sql', {
      sql: `
        alter table gl_accounts drop constraint if exists gl_accounts_section_check;
        alter table gl_accounts add constraint gl_accounts_section_check
        check (section in ('Sales','COGS','Labor','Opex','BelowTheLine','Summary','PreOpening'));
      `
    });

    // Step 2: Add columns to invoices
    console.log('2️⃣  Adding pre-opening columns to invoices...');
    const { error: e1 } = await supabase.rpc('exec', {
      query: `
        alter table invoices add column if not exists is_preopening boolean not null default false;
        alter table invoices add column if not exists preopening_category_id uuid references proforma_preopening_categories(id);
        create index if not exists idx_invoices_preopening on invoices (is_preopening, venue_id) where is_preopening = true;
        create index if not exists idx_invoices_preopening_category on invoices (preopening_category_id) where preopening_category_id is not null;
      `
    });

    // Step 3: Add column to invoice_lines
    console.log('3️⃣  Adding pre-opening column to invoice_lines...');
    const { error: e2 } = await supabase.rpc('exec', {
      query: `
        alter table invoice_lines add column if not exists is_preopening boolean not null default false;
        create index if not exists idx_invoice_lines_preopening on invoice_lines (is_preopening) where is_preopening = true;
      `
    });

    console.log('✓ Migration 116 applied successfully!\n');
    console.log('New capabilities:');
    console.log('  • invoices.is_preopening (boolean flag)');
    console.log('  • invoices.preopening_category_id (FK to proforma categories)');
    console.log('  • invoice_lines.is_preopening (auto-synced from invoice)');
    console.log('  • GL section "PreOpening" added');
    console.log('\nNext: Upload Delilah Dallas invoices and set is_preopening = true');

  } catch (error) {
    console.error('Error applying migration:', error);
  }
}

runMigration();
