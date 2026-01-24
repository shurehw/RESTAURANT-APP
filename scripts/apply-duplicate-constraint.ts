import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  console.log('🔍 Checking for existing duplicate invoices...\n');

  // First, find any existing duplicates
  const { data: duplicates } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT vendor_id, invoice_number, COUNT(*) as count
      FROM invoices
      WHERE invoice_number IS NOT NULL
      GROUP BY vendor_id, invoice_number
      HAVING COUNT(*) > 1
      ORDER BY count DESC;
    `
  });

  if (duplicates && duplicates.length > 0) {
    console.log('⚠️  Found existing duplicates:');
    console.log(duplicates);
    console.log('\nYou may want to clean these up before applying the constraint.\n');
  } else {
    console.log('✅ No existing duplicates found\n');
  }

  console.log('Applying unique constraint...\n');

  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE invoices
      ADD CONSTRAINT invoices_vendor_invoice_unique
      UNIQUE NULLS NOT DISTINCT (vendor_id, invoice_number);
    `
  });

  if (error) {
    if (error.message?.includes('already exists')) {
      console.log('✅ Constraint already exists');
    } else {
      console.error('❌ Error applying constraint:', error);
    }
  } else {
    console.log('✅ Constraint applied successfully');
  }

  console.log('\nDone!');
})();
