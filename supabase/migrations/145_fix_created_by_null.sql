-- Fix organization_id and created_by NULL issues in create_invoice_with_lines
-- Error 23502 occurs when organization_id or auth.uid() returns NULL
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
  org_id UUID;
BEGIN
  -- Get user ID, fallback to system user if auth.uid() is NULL
  user_id_value := COALESCE(
    auth.uid(),
    (SELECT id FROM auth.users WHERE email = 'system@opsos.ai' LIMIT 1)
  );

  -- Get organization_id from venue
  SELECT organization_id INTO org_id
  FROM venues
  WHERE id = (invoice_data->>'venue_id')::UUID;

  -- Insert Invoice Header
  INSERT INTO invoices (
    venue_id,
    vendor_id,
    organization_id,
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
    org_id,
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
