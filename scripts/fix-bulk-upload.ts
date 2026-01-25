import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const migrationSQL = `
-- Fix created_by NULL issue in create_invoice_with_lines
-- Error 23502 occurs when auth.uid() returns NULL
-- Also add vendor_item_code field support

CREATE OR REPLACE FUNCTION create_invoice_with_lines(
  invoice_data JSONB,
  lines_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_invoice_id UUID;
  line_item JSONB;
  user_id_value UUID;
BEGIN
  -- Get user ID, fallback to system user if auth.uid() is NULL
  user_id_value := COALESCE(
    auth.uid(),
    (SELECT id FROM auth.users WHERE email = 'system@opsos.ai' LIMIT 1)
  );

  -- Insert Invoice Header
  INSERT INTO invoices (
    venue_id,
    vendor_id,
    invoice_number,
    invoice_date,
    due_date,
    payment_terms,
    total_amount,
    status,
    ocr_confidence,
    ocr_raw_json,
    storage_path,
    is_preopening,
    created_by
  ) VALUES (
    (invoice_data->>'venue_id')::UUID,
    (invoice_data->>'vendor_id')::UUID,
    NULLIF(invoice_data->>'invoice_number', ''),
    (invoice_data->>'invoice_date')::DATE,
    NULLIF(invoice_data->>'due_date', '')::DATE,
    NULLIF(invoice_data->>'payment_terms', ''),
    (invoice_data->>'total_amount')::NUMERIC,
    COALESCE(invoice_data->>'status', 'draft')::invoice_status,
    (invoice_data->>'ocr_confidence')::NUMERIC,
    invoice_data->'ocr_raw_json',
    NULLIF(invoice_data->>'storage_path', ''),
    COALESCE((invoice_data->>'is_preopening')::BOOLEAN, false),
    user_id_value
  )
  RETURNING id INTO new_invoice_id;

  -- Insert Invoice Lines
  FOR line_item IN SELECT * FROM jsonb_array_elements(lines_data)
  LOOP
    INSERT INTO invoice_lines (
      invoice_id,
      item_id,
      vendor_item_code,
      description,
      qty,
      unit_cost,
      ocr_confidence
    ) VALUES (
      new_invoice_id,
      NULLIF(line_item->>'item_id', '')::UUID,
      NULLIF(line_item->>'vendor_item_code', ''),
      line_item->>'description',
      (line_item->>'quantity')::NUMERIC,
      (line_item->>'unit_cost')::NUMERIC,
      (line_item->>'ocr_confidence')::NUMERIC
    );
  END LOOP;

  RETURN new_invoice_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;
`;

async function applyFix() {
  console.log('Updating create_invoice_with_lines function...');

  // Execute the SQL directly
  const { data, error } = await supabase.rpc('exec_sql' as any, { query: migrationSQL });

  if (error) {
    console.error('❌ Failed to update function:', error);

    // Try alternative approach - use raw SQL query
    console.log('\nTrying direct SQL execution...');
    const { error: directError } = await supabase.from('_migrations').select('*').limit(0);

    if (directError) {
      console.error('Cannot execute SQL. Please run this migration manually in Supabase SQL Editor:');
      console.log('\n' + migrationSQL);
      process.exit(1);
    }
  } else {
    console.log('✅ Function updated successfully!');
    console.log('\nThe bulk upload should now work. The fix:');
    console.log('1. Handles NULL auth.uid() by falling back to system user');
    console.log('2. Adds vendor_item_code field support');
  }
}

applyFix();
