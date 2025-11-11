-- Perpetual Inventory System
-- Tracks theoretical inventory in real-time from receipts and usage

-- ============================================================================
-- PERPETUAL INVENTORY TABLE
-- ============================================================================

-- Current inventory balance by item/venue
CREATE TABLE IF NOT EXISTS inventory_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC(12,3) DEFAULT 0,
  unit_of_measure TEXT NOT NULL,
  last_cost NUMERIC(12,4),
  last_received_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ib_unique_venue_item UNIQUE(venue_id, item_id),
  CONSTRAINT ib_non_negative CHECK (quantity_on_hand >= 0)
);

CREATE INDEX idx_ib_venue ON inventory_balances(venue_id);
CREATE INDEX idx_ib_item ON inventory_balances(item_id);
CREATE INDEX idx_ib_venue_item ON inventory_balances(venue_id, item_id);

COMMENT ON TABLE inventory_balances IS 'Perpetual inventory - theoretical on-hand quantity by venue/item';
COMMENT ON COLUMN inventory_balances.quantity_on_hand IS 'Current theoretical balance (receipts - usage)';

-- ============================================================================
-- INVENTORY TRANSACTIONS (AUDIT LOG)
-- ============================================================================

-- All inventory movements (receipts, usage, adjustments)
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('receipt', 'usage', 'adjustment', 'count_adjustment', 'transfer')),
  quantity NUMERIC(12,3) NOT NULL, -- positive for receipts, negative for usage
  unit_cost NUMERIC(12,4),
  reference_type TEXT, -- 'receipt', 'sale', 'waste', 'transfer', 'count'
  reference_id UUID, -- receipt_id, sale_id, etc.
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_it_venue ON inventory_transactions(venue_id);
CREATE INDEX idx_it_item ON inventory_transactions(item_id);
CREATE INDEX idx_it_venue_item ON inventory_transactions(venue_id, item_id);
CREATE INDEX idx_it_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_it_reference ON inventory_transactions(reference_type, reference_id);
CREATE INDEX idx_it_created ON inventory_transactions(created_at DESC);

COMMENT ON TABLE inventory_transactions IS 'Audit log of all inventory movements';
COMMENT ON COLUMN inventory_transactions.quantity IS 'Positive = increase (receipts), Negative = decrease (usage/waste)';

-- ============================================================================
-- TRIGGERS: AUTO-UPDATE INVENTORY FROM RECEIPTS
-- ============================================================================

-- Create or update inventory balance when receipt line is created
CREATE OR REPLACE FUNCTION update_inventory_from_receipt()
RETURNS TRIGGER AS $$
DECLARE
  v_venue_id UUID;
  v_uom TEXT;
BEGIN
  -- Get venue_id from receipt
  SELECT venue_id INTO v_venue_id
  FROM receipts
  WHERE id = NEW.receipt_id;

  -- Get UOM from item
  SELECT base_uom INTO v_uom
  FROM items
  WHERE id = NEW.item_id;

  -- Insert or update inventory balance
  INSERT INTO inventory_balances (venue_id, item_id, quantity_on_hand, unit_of_measure, last_cost, last_received_at, last_updated_at)
  VALUES (v_venue_id, NEW.item_id, NEW.qty_received, v_uom, NEW.unit_cost, now(), now())
  ON CONFLICT (venue_id, item_id)
  DO UPDATE SET
    quantity_on_hand = inventory_balances.quantity_on_hand + NEW.qty_received,
    last_cost = NEW.unit_cost,
    last_received_at = now(),
    last_updated_at = now();

  -- Create transaction record
  INSERT INTO inventory_transactions (
    venue_id,
    item_id,
    transaction_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes
  ) VALUES (
    v_venue_id,
    NEW.item_id,
    'receipt',
    NEW.qty_received,
    NEW.unit_cost,
    'receipt',
    NEW.receipt_id,
    'Auto-receipt from invoice ' || (SELECT invoice_id FROM receipts WHERE id = NEW.receipt_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_inventory_on_receipt
  AFTER INSERT ON receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_from_receipt();

-- ============================================================================
-- USAGE TRACKING (POS SALES)
-- ============================================================================

-- Function to record usage from POS sales (to be called by POS integration)
CREATE OR REPLACE FUNCTION record_inventory_usage(
  p_venue_id UUID,
  p_item_id UUID,
  p_quantity NUMERIC,
  p_reference_type TEXT,
  p_reference_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Decrease inventory balance
  UPDATE inventory_balances
  SET
    quantity_on_hand = quantity_on_hand - p_quantity,
    last_updated_at = now()
  WHERE venue_id = p_venue_id
    AND item_id = p_item_id;

  -- Create transaction record (negative quantity)
  INSERT INTO inventory_transactions (
    venue_id,
    item_id,
    transaction_type,
    quantity,
    reference_type,
    reference_id,
    notes
  ) VALUES (
    p_venue_id,
    p_item_id,
    'usage',
    -p_quantity,
    p_reference_type,
    p_reference_id,
    p_notes
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_inventory_usage IS 'Records inventory decrease from usage (sales, waste, etc)';

-- ============================================================================
-- VARIANCE ADJUSTMENT (FROM PHYSICAL COUNTS)
-- ============================================================================

-- Function to adjust inventory based on physical count
CREATE OR REPLACE FUNCTION adjust_inventory_from_count(
  p_venue_id UUID,
  p_item_id UUID,
  p_counted_qty NUMERIC,
  p_count_id UUID
)
RETURNS void AS $$
DECLARE
  v_current_qty NUMERIC;
  v_variance NUMERIC;
BEGIN
  -- Get current theoretical balance
  SELECT quantity_on_hand INTO v_current_qty
  FROM inventory_balances
  WHERE venue_id = p_venue_id AND item_id = p_item_id;

  -- If no balance exists, create one
  IF v_current_qty IS NULL THEN
    INSERT INTO inventory_balances (venue_id, item_id, quantity_on_hand, unit_of_measure, last_updated_at)
    SELECT p_venue_id, p_item_id, p_counted_qty, base_uom, now()
    FROM items WHERE id = p_item_id;
    v_current_qty := 0;
  ELSE
    -- Update to counted quantity
    UPDATE inventory_balances
    SET
      quantity_on_hand = p_counted_qty,
      last_updated_at = now()
    WHERE venue_id = p_venue_id AND item_id = p_item_id;
  END IF;

  -- Calculate variance
  v_variance := p_counted_qty - v_current_qty;

  -- Record adjustment transaction
  IF v_variance != 0 THEN
    INSERT INTO inventory_transactions (
      venue_id,
      item_id,
      transaction_type,
      quantity,
      reference_type,
      reference_id,
      notes
    ) VALUES (
      p_venue_id,
      p_item_id,
      'count_adjustment',
      v_variance,
      'count',
      p_count_id,
      'Physical count variance: ' || v_variance::TEXT
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION adjust_inventory_from_count IS 'Adjusts theoretical inventory to match physical count';

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- Drop existing view if it exists
DROP VIEW IF EXISTS v_current_inventory;

-- Current inventory with item details
CREATE VIEW v_current_inventory AS
SELECT
  ib.id,
  ib.venue_id,
  v.name as venue_name,
  ib.item_id,
  i.sku,
  i.name as item_name,
  i.category,
  ib.quantity_on_hand,
  ib.unit_of_measure,
  ib.last_cost,
  ib.quantity_on_hand * COALESCE(ib.last_cost, 0) as total_value,
  ib.last_received_at,
  ib.last_updated_at
FROM inventory_balances ib
JOIN items i ON ib.item_id = i.id
JOIN venues v ON ib.venue_id = v.id
WHERE ib.quantity_on_hand > 0
ORDER BY v.name, i.category, i.name;

COMMENT ON VIEW v_current_inventory IS 'Current on-hand inventory with values';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Super admins full access
CREATE POLICY "Super admins full access to inventory_balances"
  ON inventory_balances FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins full access to inventory_transactions"
  ON inventory_transactions FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Organization users access their venues
CREATE POLICY "Users access their org inventory_balances"
  ON inventory_balances FOR ALL TO authenticated
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

CREATE POLICY "Users access their org inventory_transactions"
  ON inventory_transactions FOR ALL TO authenticated
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
