-- Auto-Receiving System: Invoice-to-PO Matching

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE receipt_status AS ENUM ('auto_generated', 'manual', 'partial', 'complete');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE match_confidence AS ENUM ('high', 'medium', 'low', 'unmapped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE variance_severity AS ENUM ('none', 'minor', 'warning', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- RECEIPTS
-- ============================================================================

-- Receipts (auto-generated from invoices)
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  venue_id UUID NOT NULL REFERENCES venues(id),
  invoice_id UUID REFERENCES invoices(id),
  received_at TIMESTAMPTZ DEFAULT now(),
  received_by UUID REFERENCES auth.users(id),
  auto_generated BOOLEAN DEFAULT true,
  status receipt_status DEFAULT 'auto_generated',
  total_amount NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT receipts_positive_total CHECK (total_amount >= 0)
);

CREATE INDEX idx_receipts_po ON receipts(purchase_order_id);
CREATE INDEX idx_receipts_invoice ON receipts(invoice_id);
CREATE INDEX idx_receipts_vendor ON receipts(vendor_id);
CREATE INDEX idx_receipts_venue ON receipts(venue_id);
CREATE INDEX idx_receipts_date ON receipts(received_at DESC);

COMMENT ON TABLE receipts IS 'Receipt records, primarily auto-generated from invoice matching';

-- Receipt Lines
CREATE TABLE IF NOT EXISTS receipt_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES purchase_order_items(id),
  invoice_line_id UUID REFERENCES invoice_lines(id),
  item_id UUID REFERENCES items(id),
  qty_received NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL,
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (qty_received * unit_cost) STORED,
  match_confidence match_confidence DEFAULT 'high',
  price_variance_pct NUMERIC(5,2),
  qty_variance_pct NUMERIC(5,2),
  variance_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT rl_positive_qty CHECK (qty_received > 0 AND unit_cost >= 0)
);

CREATE INDEX idx_rl_receipt ON receipt_lines(receipt_id);
CREATE INDEX idx_rl_po_item ON receipt_lines(purchase_order_item_id);
CREATE INDEX idx_rl_invoice_line ON receipt_lines(invoice_line_id);
CREATE INDEX idx_rl_item ON receipt_lines(item_id);
CREATE INDEX idx_rl_confidence ON receipt_lines(match_confidence);

COMMENT ON TABLE receipt_lines IS 'Line items for receipts with variance tracking';

-- ============================================================================
-- VENDOR TOLERANCES
-- ============================================================================

-- Vendor-specific matching tolerances
CREATE TABLE IF NOT EXISTS vendor_tolerances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID REFERENCES vendors(id),
  matching_mode TEXT DEFAULT 'flexible', -- 'strict', 'flexible', 'edi'
  price_tolerance_pct NUMERIC(5,2) DEFAULT 3.0,
  qty_tolerance_pct NUMERIC(5,2) DEFAULT 5.0,
  require_po_number BOOLEAN DEFAULT false,
  auto_approve_threshold_pct NUMERIC(5,2) DEFAULT 90.0,
  critical_items JSONB, -- array of item_ids requiring stricter validation
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT vt_valid_pct CHECK (
    price_tolerance_pct >= 0 AND
    qty_tolerance_pct >= 0 AND
    auto_approve_threshold_pct >= 0 AND
    auto_approve_threshold_pct <= 100
  )
);

CREATE UNIQUE INDEX idx_vt_vendor ON vendor_tolerances(vendor_id);

COMMENT ON TABLE vendor_tolerances IS 'Per-vendor matching rules and approval thresholds';

-- Default tolerances for vendors without specific config
INSERT INTO vendor_tolerances (vendor_id, matching_mode, price_tolerance_pct, qty_tolerance_pct, require_po_number)
VALUES (NULL, 'flexible', 3.0, 5.0, false)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- UNMAPPED ITEMS QUEUE
-- ============================================================================

-- Queue for invoice lines that couldn't match to items
CREATE TABLE IF NOT EXISTS unmapped_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  raw_description TEXT NOT NULL,
  pack_size TEXT,
  unit_of_measure TEXT,
  last_unit_cost NUMERIC(12,4),
  last_seen_invoice_id UUID REFERENCES invoices(id),
  occurrence_count INT DEFAULT 1,
  mapped_to_item_id UUID REFERENCES items(id),
  status TEXT DEFAULT 'pending', -- 'pending', 'mapped', 'ignored'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ui_positive_cost CHECK (last_unit_cost IS NULL OR last_unit_cost >= 0)
);

CREATE INDEX idx_ui_vendor ON unmapped_items(vendor_id);
CREATE INDEX idx_ui_status ON unmapped_items(status);
CREATE INDEX idx_ui_invoice ON unmapped_items(last_seen_invoice_id);

COMMENT ON TABLE unmapped_items IS 'Queue of unmatched invoice items requiring mapping';

-- ============================================================================
-- INVOICE-PO LINKING
-- ============================================================================

-- Add PO reference to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS po_number_ocr TEXT,
  ADD COLUMN IF NOT EXISTS match_confidence match_confidence,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_variance_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS variance_severity variance_severity DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_invoices_po ON invoices(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_auto_approved ON invoices(auto_approved);
CREATE INDEX IF NOT EXISTS idx_invoices_variance ON invoices(variance_severity);

-- Add remaining quantity tracking to PO items
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS qty_received NUMERIC(12,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_qty NUMERIC(12,3) GENERATED ALWAYS AS (quantity - COALESCE(qty_received, 0)) STORED;

COMMENT ON COLUMN purchase_order_items.qty_received IS 'Total quantity received against this PO line';
COMMENT ON COLUMN purchase_order_items.remaining_qty IS 'Outstanding quantity yet to be received';

-- ============================================================================
-- VARIANCE TRACKING
-- ============================================================================

-- Variance summary for invoices
CREATE TABLE IF NOT EXISTS invoice_variances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES receipts(id),
  variance_type TEXT NOT NULL, -- 'price', 'quantity', 'unmapped', 'no_po'
  severity variance_severity NOT NULL,
  line_count INT DEFAULT 0,
  total_variance_amount NUMERIC(12,2),
  variance_pct NUMERIC(5,2),
  description TEXT,
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_iv_invoice ON invoice_variances(invoice_id);
CREATE INDEX idx_iv_severity ON invoice_variances(severity);
CREATE INDEX idx_iv_resolved ON invoice_variances(resolved);

COMMENT ON TABLE invoice_variances IS 'Aggregated variance tracking for review workflow';

-- ============================================================================
-- VENDOR ITEM ALIASES
-- ============================================================================

-- Vendor-specific item codes and aliases for fuzzy matching
CREATE TABLE IF NOT EXISTS vendor_item_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  item_id UUID NOT NULL REFERENCES items(id),
  vendor_item_code TEXT NOT NULL,
  vendor_description TEXT,
  pack_size TEXT,
  last_unit_cost NUMERIC(12,4),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendor_id, vendor_item_code)
);

CREATE INDEX idx_via_vendor_item ON vendor_item_aliases(vendor_id, item_id);
CREATE INDEX idx_via_code ON vendor_item_aliases(vendor_item_code);

COMMENT ON TABLE vendor_item_aliases IS 'Vendor-specific codes and descriptions for matching';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update receipt total when lines change
CREATE OR REPLACE FUNCTION update_receipt_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE receipts
  SET total_amount = (
    SELECT COALESCE(SUM(line_total), 0)
    FROM receipt_lines
    WHERE receipt_id = COALESCE(NEW.receipt_id, OLD.receipt_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.receipt_id, OLD.receipt_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_receipt_total_on_line_change
  AFTER INSERT OR UPDATE OR DELETE ON receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_receipt_total();

-- Update PO item received quantities
CREATE OR REPLACE FUNCTION update_po_item_received()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.purchase_order_item_id IS NOT NULL THEN
    UPDATE purchase_order_items
    SET qty_received = (
      SELECT COALESCE(SUM(qty_received), 0)
      FROM receipt_lines
      WHERE purchase_order_item_id = NEW.purchase_order_item_id
    )
    WHERE id = NEW.purchase_order_item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_po_received_on_receipt
  AFTER INSERT OR UPDATE ON receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_po_item_received();

-- Auto-update PO status based on received quantities
CREATE OR REPLACE FUNCTION update_po_status()
RETURNS TRIGGER AS $$
DECLARE
  v_po_id UUID;
  v_all_received BOOLEAN;
BEGIN
  SELECT purchase_order_id INTO v_po_id
  FROM purchase_order_items
  WHERE id = NEW.id;

  SELECT BOOL_AND(remaining_qty <= 0.01) INTO v_all_received
  FROM purchase_order_items
  WHERE purchase_order_id = v_po_id;

  IF v_all_received THEN
    UPDATE purchase_orders
    SET status = 'received', updated_at = now()
    WHERE id = v_po_id AND status != 'received';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_po_status
  AFTER UPDATE OF qty_received ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_po_status();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_tolerances ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmapped_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_item_aliases ENABLE ROW LEVEL SECURITY;

-- Super admins full access
CREATE POLICY "Super admins full access to receipts"
  ON receipts FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins full access to receipt_lines"
  ON receipt_lines FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins full access to vendor_tolerances"
  ON vendor_tolerances FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins full access to unmapped_items"
  ON unmapped_items FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins full access to invoice_variances"
  ON invoice_variances FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins full access to vendor_item_aliases"
  ON vendor_item_aliases FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Organization users access their data
CREATE POLICY "Users access their org receipts"
  ON receipts FOR ALL TO authenticated
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

CREATE POLICY "Users access their org receipt_lines"
  ON receipt_lines FOR ALL TO authenticated
  USING (
    receipt_id IN (
      SELECT r.id FROM receipts r
      JOIN venues v ON r.venue_id = v.id
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  )
  WITH CHECK (
    receipt_id IN (
      SELECT r.id FROM receipts r
      JOIN venues v ON r.venue_id = v.id
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );
