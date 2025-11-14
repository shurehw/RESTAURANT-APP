/**
 * Migration 044: Vendor Statement Reconciliation
 * Purpose: Three-way match (PO → Receipt → Invoice) for vendor statement reconciliation
 * Features: Auto-matching by PO#, invoice#, date+amount with confidence scoring
 */

-- Vendor Statements: Monthly/weekly statements from vendors
CREATE TABLE IF NOT EXISTS vendor_statements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  statement_number TEXT,
  statement_period_start DATE NOT NULL,
  statement_period_end DATE NOT NULL,
  statement_total NUMERIC(12,2) NOT NULL,
  statement_pdf_url TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by UUID REFERENCES auth.users(id),
  reconciled BOOLEAN NOT NULL DEFAULT false,
  reconciled_at TIMESTAMPTZ,
  reconciled_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vendor_statements_unique UNIQUE(vendor_id, venue_id, statement_period_start, statement_period_end)
);

CREATE INDEX idx_vendor_statements_vendor ON vendor_statements(vendor_id);
CREATE INDEX idx_vendor_statements_venue ON vendor_statements(venue_id);
CREATE INDEX idx_vendor_statements_reconciled ON vendor_statements(reconciled) WHERE reconciled = false;
CREATE INDEX idx_vendor_statements_period ON vendor_statements(statement_period_start DESC, statement_period_end DESC);

-- Vendor Statement Lines: Individual line items from vendor statements
CREATE TABLE IF NOT EXISTS vendor_statement_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_statement_id UUID NOT NULL REFERENCES vendor_statements(id) ON DELETE CASCADE,
  line_number INTEGER,
  line_date DATE NOT NULL,
  invoice_number TEXT,
  reference_number TEXT,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  matched_po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  match_method TEXT CHECK (match_method IN ('po_number', 'invoice_number', 'date_amount', 'ai_suggested', 'manual')),
  match_confidence NUMERIC(3,2) CHECK (match_confidence >= 0 AND match_confidence <= 1), -- 0.00 to 1.00
  matched BOOLEAN NOT NULL DEFAULT false,
  requires_review BOOLEAN NOT NULL DEFAULT false,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  variance_amount NUMERIC(12,2), -- Difference between statement amount and PO/receipt
  variance_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendor_statement_lines_statement ON vendor_statement_lines(vendor_statement_id);
CREATE INDEX idx_vendor_statement_lines_matched ON vendor_statement_lines(matched) WHERE matched = false;
CREATE INDEX idx_vendor_statement_lines_review ON vendor_statement_lines(requires_review) WHERE requires_review = true;
CREATE INDEX idx_vendor_statement_lines_po ON vendor_statement_lines(matched_po_id);
CREATE INDEX idx_vendor_statement_lines_date ON vendor_statement_lines(line_date DESC);

-- Three-Way Match View: Compare PO → Receipt → Invoice
CREATE OR REPLACE VIEW three_way_match AS
SELECT
  vsl.id as statement_line_id,
  vsl.vendor_statement_id,
  vs.vendor_id,
  vs.venue_id,
  v.name as vendor_name,
  vsl.line_date,
  vsl.invoice_number,
  vsl.description,
  vsl.amount as invoice_amount,

  -- Purchase Order Info
  po.id as po_id,
  po.order_number as po_number,
  po.order_date,
  po.total_amount as po_total,
  po.status as po_status,

  -- Receipt Info
  r.id as receipt_id,
  r.received_at,
  r.total_amount as receipt_total,

  -- Matching Info
  vsl.matched,
  vsl.match_method,
  vsl.match_confidence,
  vsl.requires_review,

  -- Variance Analysis
  (vsl.amount - COALESCE(r.total_amount, po.total_amount, 0)) as variance,
  ABS(vsl.amount - COALESCE(r.total_amount, po.total_amount, 0)) as abs_variance,
  CASE
    WHEN vsl.matched = false THEN 'unmatched'
    WHEN ABS(vsl.amount - COALESCE(r.total_amount, po.total_amount, 0)) < 1 THEN 'matched_exact'
    WHEN vsl.amount > COALESCE(r.total_amount, po.total_amount, 0) THEN 'overcharged'
    ELSE 'undercharged'
  END as match_status,

  vsl.created_at,
  vsl.reviewed,
  vsl.reviewed_at,
  vsl.reviewed_by

FROM vendor_statement_lines vsl
JOIN vendor_statements vs ON vs.id = vsl.vendor_statement_id
JOIN vendors v ON v.id = vs.vendor_id
LEFT JOIN purchase_orders po ON po.id = vsl.matched_po_id
LEFT JOIN receipts r ON r.purchase_order_id = po.id;

-- Function: Auto-match vendor statement lines using rules
DROP FUNCTION IF EXISTS auto_match_vendor_statement_line(UUID);
CREATE OR REPLACE FUNCTION auto_match_vendor_statement_line(
  p_statement_line_id UUID
)
RETURNS TABLE (
  matched BOOLEAN,
  po_id UUID,
  match_method TEXT,
  confidence NUMERIC
) AS $$
DECLARE
  v_line RECORD;
  v_matched_po_id UUID;
  v_match_method TEXT;
  v_confidence NUMERIC;
  v_variance NUMERIC;
BEGIN
  -- Get statement line details
  SELECT
    vsl.*,
    vs.vendor_id,
    vs.venue_id
  INTO v_line
  FROM vendor_statement_lines vsl
  JOIN vendor_statements vs ON vs.id = vsl.vendor_statement_id
  WHERE vsl.id = p_statement_line_id;

  -- RULE 1: Exact PO number match (highest confidence)
  IF v_line.invoice_number IS NOT NULL THEN
    SELECT po.id INTO v_matched_po_id
    FROM purchase_orders po
    WHERE po.order_number = v_line.invoice_number
      AND po.vendor_id = v_line.vendor_id
      AND po.venue_id = v_line.venue_id
    LIMIT 1;

    IF v_matched_po_id IS NOT NULL THEN
      v_match_method := 'po_number';
      v_confidence := 0.99;

      -- Update the statement line
      UPDATE vendor_statement_lines
      SET
        matched_po_id = v_matched_po_id,
        matched = true,
        match_method = v_match_method,
        match_confidence = v_confidence,
        requires_review = false
      WHERE id = p_statement_line_id;

      RETURN QUERY SELECT true, v_matched_po_id, v_match_method, v_confidence;
      RETURN;
    END IF;
  END IF;

  -- RULE 2: Invoice number match from receipt
  IF v_line.invoice_number IS NOT NULL THEN
    SELECT po.id INTO v_matched_po_id
    FROM purchase_orders po
    JOIN receipts r ON r.purchase_order_id = po.id
    JOIN invoices i ON i.id = r.invoice_id
    WHERE i.invoice_number = v_line.invoice_number
      AND po.vendor_id = v_line.vendor_id
      AND po.venue_id = v_line.venue_id
    LIMIT 1;

    IF v_matched_po_id IS NOT NULL THEN
      v_match_method := 'invoice_number';
      v_confidence := 0.95;

      UPDATE vendor_statement_lines
      SET
        matched_po_id = v_matched_po_id,
        matched = true,
        match_method = v_match_method,
        match_confidence = v_confidence,
        requires_review = false
      WHERE id = p_statement_line_id;

      RETURN QUERY SELECT true, v_matched_po_id, v_match_method, v_confidence;
      RETURN;
    END IF;
  END IF;

  -- RULE 3: Date + Amount match (±$5 tolerance, within ±7 days)
  SELECT
    po.id,
    ABS(COALESCE(r.total_amount, po.total_amount) - v_line.amount)
  INTO v_matched_po_id, v_variance
  FROM purchase_orders po
  LEFT JOIN receipts r ON r.purchase_order_id = po.id
  WHERE po.vendor_id = v_line.vendor_id
    AND po.venue_id = v_line.venue_id
    AND ABS(EXTRACT(EPOCH FROM (COALESCE(r.received_at, po.order_date)::DATE - v_line.line_date)) / 86400) <= 7
    AND ABS(COALESCE(r.total_amount, po.total_amount) - v_line.amount) < 5.00
  ORDER BY
    ABS(COALESCE(r.received_at, po.order_date)::DATE - v_line.line_date),
    ABS(COALESCE(r.total_amount, po.total_amount) - v_line.amount)
  LIMIT 1;

  IF v_matched_po_id IS NOT NULL THEN
    v_match_method := 'date_amount';
    -- Confidence decreases with variance
    v_confidence := 0.85 - (v_variance / 5.00 * 0.15); -- 0.85 at $0 variance, 0.70 at $5 variance

    UPDATE vendor_statement_lines
    SET
      matched_po_id = v_matched_po_id,
      matched = true,
      match_method = v_match_method,
      match_confidence = v_confidence,
      requires_review = (v_confidence < 0.80) -- Flag for review if confidence < 80%
    WHERE id = p_statement_line_id;

    RETURN QUERY SELECT true, v_matched_po_id, v_match_method, v_confidence;
    RETURN;
  END IF;

  -- No match found
  UPDATE vendor_statement_lines
  SET
    matched = false,
    requires_review = true
  WHERE id = p_statement_line_id;

  RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::NUMERIC;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-match all lines in a statement
DROP FUNCTION IF EXISTS auto_match_vendor_statement(UUID);
CREATE OR REPLACE FUNCTION auto_match_vendor_statement(
  p_statement_id UUID
)
RETURNS TABLE (
  total_lines INTEGER,
  matched_lines INTEGER,
  unmatched_lines INTEGER,
  review_required INTEGER
) AS $$
DECLARE
  v_total INTEGER;
  v_matched INTEGER;
  v_unmatched INTEGER;
  v_review INTEGER;
  v_line RECORD;
BEGIN
  -- Match all lines
  FOR v_line IN
    SELECT id FROM vendor_statement_lines
    WHERE vendor_statement_id = p_statement_id
  LOOP
    PERFORM auto_match_vendor_statement_line(v_line.id);
  END LOOP;

  -- Get counts
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE matched = true),
    COUNT(*) FILTER (WHERE matched = false),
    COUNT(*) FILTER (WHERE requires_review = true)
  INTO v_total, v_matched, v_unmatched, v_review
  FROM vendor_statement_lines
  WHERE vendor_statement_id = p_statement_id;

  RETURN QUERY SELECT v_total, v_matched, v_unmatched, v_review;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate variance for matched line
DROP FUNCTION IF EXISTS calculate_statement_variance(UUID);
CREATE OR REPLACE FUNCTION calculate_statement_variance(
  p_statement_line_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_variance NUMERIC;
BEGIN
  SELECT
    vsl.amount - COALESCE(r.total_amount, po.total_amount, 0)
  INTO v_variance
  FROM vendor_statement_lines vsl
  LEFT JOIN purchase_orders po ON po.id = vsl.matched_po_id
  LEFT JOIN receipts r ON r.purchase_order_id = po.id
  WHERE vsl.id = p_statement_line_id;

  UPDATE vendor_statement_lines
  SET variance_amount = v_variance
  WHERE id = p_statement_line_id;

  RETURN v_variance;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at
CREATE OR REPLACE FUNCTION update_vendor_statements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_statements_updated_at
  BEFORE UPDATE ON vendor_statements
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_statements_updated_at();

CREATE TRIGGER vendor_statement_lines_updated_at
  BEFORE UPDATE ON vendor_statement_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_statements_updated_at();

-- Enable RLS
ALTER TABLE vendor_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_statement_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies (temporary - allow all for now)
CREATE POLICY vendor_statements_select ON vendor_statements FOR SELECT USING (true);
CREATE POLICY vendor_statements_all ON vendor_statements FOR ALL USING (true);
CREATE POLICY vendor_statement_lines_select ON vendor_statement_lines FOR SELECT USING (true);
CREATE POLICY vendor_statement_lines_all ON vendor_statement_lines FOR ALL USING (true);

COMMENT ON TABLE vendor_statements IS 'Monthly/weekly vendor statements for reconciliation';
COMMENT ON TABLE vendor_statement_lines IS 'Individual line items from vendor statements with auto-matching';
COMMENT ON VIEW three_way_match IS 'Three-way match view: PO → Receipt → Invoice reconciliation';
COMMENT ON FUNCTION auto_match_vendor_statement_line IS 'Auto-match statement line using PO#, invoice#, or date+amount rules';
COMMENT ON FUNCTION auto_match_vendor_statement IS 'Auto-match all lines in a vendor statement';
COMMENT ON FUNCTION calculate_statement_variance IS 'Calculate variance between statement amount and PO/receipt';
