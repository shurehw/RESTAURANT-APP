/**
 * Migration 034: Item Pars and Costs
 * Purpose: Track par levels and cost history for inventory items
 * Tables: item_pars, item_cost_history
 */

-- Item Pars: Min/max inventory levels per venue per item
CREATE TABLE IF NOT EXISTS item_pars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  par_level NUMERIC(12,3) NOT NULL CHECK (par_level >= 0),
  reorder_point NUMERIC(12,3) NOT NULL CHECK (reorder_point >= 0),
  reorder_quantity NUMERIC(12,3) CHECK (reorder_quantity >= 0),
  max_level NUMERIC(12,3) CHECK (max_level >= par_level),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT item_pars_unique UNIQUE(venue_id, item_id)
);

CREATE INDEX idx_item_pars_venue_id ON item_pars(venue_id);
CREATE INDEX idx_item_pars_item_id ON item_pars(item_id);
CREATE INDEX idx_item_pars_below_reorder ON item_pars(venue_id, item_id)
  WHERE reorder_point > 0;

-- Item Cost History: Track cost changes over time for variance detection
CREATE TABLE IF NOT EXISTS item_cost_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  cost NUMERIC(12,4) NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT CHECK (source IN ('receipt', 'invoice', 'manual', 'import')),
  source_id UUID, -- Links to receipt_lines or invoice_lines
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_item_cost_history_item_id ON item_cost_history(item_id, effective_date DESC);
CREATE INDEX idx_item_cost_history_vendor_id ON item_cost_history(vendor_id);
CREATE INDEX idx_item_cost_history_venue_id ON item_cost_history(venue_id);
CREATE INDEX idx_item_cost_history_effective_date ON item_cost_history(effective_date DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_item_pars_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER item_pars_updated_at
  BEFORE UPDATE ON item_pars
  FOR EACH ROW
  EXECUTE FUNCTION update_item_pars_updated_at();

-- Function to record cost history from receipts
CREATE OR REPLACE FUNCTION record_cost_from_receipt()
RETURNS TRIGGER AS $$
BEGIN
  -- Only record if cost changed significantly (>2% variance)
  IF NOT EXISTS (
    SELECT 1 FROM item_cost_history
    WHERE item_id = NEW.item_id
      AND vendor_id = (SELECT vendor_id FROM receipts WHERE id = NEW.receipt_id)
      AND ABS(cost - NEW.unit_cost) / NULLIF(cost, 0) < 0.02
      AND effective_date > NOW() - INTERVAL '7 days'
    LIMIT 1
  ) THEN
    INSERT INTO item_cost_history (
      item_id,
      vendor_id,
      venue_id,
      cost,
      effective_date,
      source,
      source_id
    )
    SELECT
      NEW.item_id,
      r.vendor_id,
      r.venue_id,
      NEW.unit_cost,
      COALESCE(r.received_at, r.created_at),
      'receipt',
      NEW.id
    FROM receipts r
    WHERE r.id = NEW.receipt_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-record cost history
CREATE TRIGGER record_cost_from_receipt_trigger
  AFTER INSERT OR UPDATE OF unit_cost ON receipt_lines
  FOR EACH ROW
  WHEN (NEW.unit_cost IS NOT NULL)
  EXECUTE FUNCTION record_cost_from_receipt();

-- View: Items below reorder point
CREATE OR REPLACE VIEW items_below_reorder AS
SELECT
  ip.venue_id,
  ip.item_id,
  i.name as item_name,
  i.sku,
  ib.quantity_on_hand,
  ip.reorder_point,
  ip.reorder_quantity,
  ip.par_level,
  ib.last_cost,
  (ip.reorder_quantity * COALESCE(ib.last_cost, 0)) as estimated_order_cost,
  v.name as venue_name
FROM item_pars ip
JOIN items i ON ip.item_id = i.id
LEFT JOIN inventory_balances ib ON ip.item_id = ib.item_id AND ip.venue_id = ib.venue_id
JOIN venues v ON ip.venue_id = v.id
WHERE ib.quantity_on_hand < ip.reorder_point
  AND i.is_active = true
  AND v.is_active = true
ORDER BY (ip.reorder_point - ib.quantity_on_hand) DESC;

COMMENT ON TABLE item_pars IS 'Min/max inventory levels and reorder points per venue per item';
COMMENT ON TABLE item_cost_history IS 'Historical cost data for variance detection and trend analysis';
COMMENT ON VIEW items_below_reorder IS 'Items currently below their reorder point, ready for PO generation';
