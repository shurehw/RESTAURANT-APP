/**
 * Apply the unique constraint to prevent duplicate invoices
 * Migration 144 was never applied to production database
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function applyConstraint() {
  console.log('🔧 Applying unique constraint to invoices table...\n');

  // We'll use a SQL function approach since we need to run raw DDL
  // First create a function that applies the constraint
  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION apply_invoice_constraint()
    RETURNS text
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- Check if constraint exists
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'invoices_vendor_invoice_unique'
      ) THEN
        RETURN 'Constraint already exists';
      END IF;

      -- Apply the constraint
      ALTER TABLE invoices
      ADD CONSTRAINT invoices_vendor_invoice_unique
      UNIQUE NULLS NOT DISTINCT (vendor_id, invoice_number);

      RETURN 'Constraint applied successfully';
    END;
    $$;
  `;

  console.log('Creating helper function...');
  const { error: funcError } = await supabase.rpc('exec_sql', { query: createFunctionSQL });

  if (funcError && !funcError.message.includes('does not exist')) {
    // Try direct SQL via Postgres connection string
    console.log('\nTrying direct SQL execution...\n');

    const { data, error } = await supabase
      .from('invoices')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Cannot connect to database:', error);
      throw error;
    }

    console.log('Please run this SQL manually in Supabase SQL Editor:');
    console.log('━'.repeat(80));
    console.log(`
ALTER TABLE invoices
ADD CONSTRAINT invoices_vendor_invoice_unique
UNIQUE NULLS NOT DISTINCT (vendor_id, invoice_number);

COMMENT ON CONSTRAINT invoices_vendor_invoice_unique ON invoices IS
'Prevent duplicate invoice numbers from the same vendor. NULLS NOT DISTINCT means even NULL invoice_numbers are considered equal (prevents multiple null invoices from same vendor).';
    `);
    console.log('━'.repeat(80));
    console.log('\nAfter running, re-run this script to test the constraint.\n');
    return;
  }

  // Call the function
  console.log('Applying constraint...');
  const { data: result, error: applyError } = await supabase.rpc('apply_invoice_constraint');

  if (applyError) {
    console.error('❌ Failed:', applyError.message);
    throw applyError;
  }

  console.log(`✅ ${result}\n`);

  console.log('\n🧪 Testing constraint...\n');

  // Test the constraint
  const testVendorId = '644b5899-1d55-449e-b7a6-f148f6e57f4a'; // Allen Brothers

  const { data: venues } = await supabase
    .from('venues')
    .select('id, organization_id')
    .limit(1);

  if (!venues || venues.length === 0) {
    console.log('Cannot test - no venues found');
    return;
  }

  const { data: insertData, error: insertError } = await supabase
    .from('invoices')
    .insert({
      venue_id: venues[0].id,
      vendor_id: testVendorId,
      invoice_number: '1B8357',
      invoice_date: '2026-01-23',
      total_amount: 999.99,
      status: 'draft',
      organization_id: venues[0].organization_id
    })
    .select();

  if (insertError) {
    if (insertError.message.includes('invoices_vendor_invoice_unique') || insertError.code === '23505') {
      console.log('✅ CONSTRAINT WORKS! Duplicate was blocked.');
      console.log('Error:', insertError.message);
    } else {
      console.log('Unexpected error:', insertError.message);
    }
  } else {
    console.log('⚠️  Test failed - duplicate was allowed!');
    // Clean up
    await supabase.from('invoices').delete().eq('id', insertData[0].id);
  }
}

applyConstraint().catch(console.error);
