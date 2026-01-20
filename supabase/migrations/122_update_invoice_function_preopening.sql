-- Update create_invoice_with_lines to support is_preopening flag

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
BEGIN
  -- Insert Invoice Header
  INSERT INTO invoices (
    venue_id,
    vendor_id,
    invoice_number,
    invoice_date,
    due_date,
    total_amount,
    status,
    ocr_confidence,
    ocr_raw_json,
    image_url,
    is_preopening,
    created_by
  ) VALUES (
    (invoice_data->>'venue_id')::UUID,
    (invoice_data->>'vendor_id')::UUID,
    NULLIF(invoice_data->>'invoice_number', ''),
    (invoice_data->>'invoice_date')::DATE,
    NULLIF(invoice_data->>'due_date', '')::DATE,
    (invoice_data->>'total_amount')::NUMERIC,
    COALESCE(invoice_data->>'status', 'draft')::invoice_status,
    (invoice_data->>'ocr_confidence')::NUMERIC,
    invoice_data->'ocr_raw_json',
    NULLIF(invoice_data->>'image_url', ''),
    COALESCE((invoice_data->>'is_preopening')::BOOLEAN, false),
    auth.uid()
  )
  RETURNING id INTO new_invoice_id;

  -- Insert Invoice Lines
  FOR line_item IN SELECT * FROM jsonb_array_elements(lines_data)
  LOOP
    INSERT INTO invoice_lines (
      invoice_id,
      item_id,
      description,
      qty,
      unit_cost,
      ocr_confidence
    ) VALUES (
      new_invoice_id,
      NULLIF(line_item->>'item_id', '')::UUID,
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
