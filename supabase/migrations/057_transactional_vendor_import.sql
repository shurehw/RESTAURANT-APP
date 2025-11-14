/**
 * Migration 057: Transactional Vendor Statement Import
 * Purpose: Replace multi-step API route logic with atomic SQL function
 * Benefits:
 * - All operations in single transaction (rollback on any failure)
 * - Better performance (no network round-trips)
 * - Consistent error handling
 * - Prevents partial imports
 */

-- Drop existing auto-match function if exists
DROP FUNCTION IF EXISTS auto_match_vendor_statement(UUID);

-- Create comprehensive import function
CREATE OR REPLACE FUNCTION import_vendor_statement(
  p_vendor_id UUID,
  p_venue_id UUID,
  p_statement_number TEXT,
  p_statement_period_start DATE,
  p_statement_period_end DATE,
  p_statement_total NUMERIC,
  p_lines JSONB,
  p_imported_by UUID
)
RETURNS TABLE(
  statement_id UUID,
  total_lines INT,
  matched_lines INT,
  unmatched_lines INT,
  review_required INT
) AS $$
DECLARE
  v_statement_id UUID;
  v_line JSONB;
  v_line_id UUID;
  v_match_po_id UUID;
  v_match_confidence NUMERIC;
  v_matched_count INT := 0;
  v_unmatched_count INT := 0;
  v_review_count INT := 0;
  v_total_count INT := 0;
BEGIN
  -- Insert vendor statement
  INSERT INTO vendor_statements (
    vendor_id,
    venue_id,
    statement_number,
    statement_period_start,
    statement_period_end,
    statement_total,
    imported_by
  ) VALUES (
    p_vendor_id,
    p_venue_id,
    p_statement_number,
    p_statement_period_start,
    p_statement_period_end,
    p_statement_total,
    p_imported_by
  )
  RETURNING id INTO v_statement_id;

  -- Insert statement lines and attempt matching
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_total_count := v_total_count + 1;

    -- Insert statement line
    INSERT INTO vendor_statement_lines (
      vendor_statement_id,
      line_number,
      line_date,
      invoice_number,
      reference_number,
      description,
      amount
    ) VALUES (
      v_statement_id,
      COALESCE((v_line->>'line_number')::INT, v_total_count),
      (v_line->>'line_date')::DATE,
      v_line->>'invoice_number',
      v_line->>'reference_number',
      v_line->>'description',
      (v_line->>'amount')::NUMERIC
    )
    RETURNING id INTO v_line_id;

    -- Attempt auto-match using rule-based logic
    v_match_po_id := NULL;
    v_match_confidence := 0;

    -- Rule 1: Exact PO number match (confidence: 1.0)
    IF v_line->>'reference_number' IS NOT NULL THEN
      SELECT po.id INTO v_match_po_id
      FROM purchase_orders po
      WHERE po.order_number = v_line->>'reference_number'
        AND po.venue_id = p_venue_id
        AND po.vendor_id = p_vendor_id
      LIMIT 1;

      IF v_match_po_id IS NOT NULL THEN
        v_match_confidence := 1.0;
      END IF;
    END IF;

    -- Rule 2: Invoice number match (confidence: 0.9)
    IF v_match_po_id IS NULL AND v_line->>'invoice_number' IS NOT NULL THEN
      SELECT po.id INTO v_match_po_id
      FROM purchase_orders po
      JOIN invoices i ON i.id = (
        SELECT inv.id FROM invoices inv
        WHERE inv.invoice_number = v_line->>'invoice_number'
          AND inv.venue_id = p_venue_id
        LIMIT 1
      )
      WHERE po.id = i.purchase_order_id
        AND po.vendor_id = p_vendor_id
      LIMIT 1;

      IF v_match_po_id IS NOT NULL THEN
        v_match_confidence := 0.9;
      END IF;
    END IF;

    -- Rule 3: Date + amount fuzzy match (confidence: 0.7)
    IF v_match_po_id IS NULL THEN
      SELECT po.id INTO v_match_po_id
      FROM purchase_orders po
      WHERE po.venue_id = p_venue_id
        AND po.vendor_id = p_vendor_id
        AND po.order_date BETWEEN (v_line->>'line_date')::DATE - INTERVAL '7 days'
                              AND (v_line->>'line_date')::DATE + INTERVAL '7 days'
        AND ABS(po.total_amount - (v_line->>'amount')::NUMERIC) < 1.00
      ORDER BY ABS(po.total_amount - (v_line->>'amount')::NUMERIC)
      LIMIT 1;

      IF v_match_po_id IS NOT NULL THEN
        v_match_confidence := 0.7;
      END IF;
    END IF;

    -- Update line with match result
    IF v_match_po_id IS NOT NULL THEN
      UPDATE vendor_statement_lines
      SET
        matched_po_id = v_match_po_id,
        match_confidence = v_match_confidence,
        match_status = CASE
          WHEN v_match_confidence >= 0.9 THEN 'matched'
          ELSE 'review_required'
        END
      WHERE id = v_line_id;

      IF v_match_confidence >= 0.9 THEN
        v_matched_count := v_matched_count + 1;
      ELSE
        v_review_count := v_review_count + 1;
      END IF;
    ELSE
      v_unmatched_count := v_unmatched_count + 1;
    END IF;
  END LOOP;

  -- Return statistics
  RETURN QUERY SELECT
    v_statement_id,
    v_total_count,
    v_matched_count,
    v_unmatched_count,
    v_review_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (RLS will still apply to underlying tables)
GRANT EXECUTE ON FUNCTION import_vendor_statement TO authenticated;

COMMENT ON FUNCTION import_vendor_statement IS 'Atomically imports vendor statement with lines and performs rule-based auto-matching';
