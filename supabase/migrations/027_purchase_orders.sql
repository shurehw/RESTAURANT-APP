-- Purchase Orders System

-- Create order status enum
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('draft', 'pending', 'ordered', 'received', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  venue_id UUID NOT NULL REFERENCES venues(id),
  order_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,
  status order_status DEFAULT 'draft',
  total_amount NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT po_positive_total CHECK (total_amount >= 0)
);

-- Purchase Order Items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  quantity NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,4) NOT NULL,
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT poi_positive_qty CHECK (quantity > 0),
  CONSTRAINT poi_positive_price CHECK (unit_price >= 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_venue ON purchase_orders(venue_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_poi_order ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_item ON purchase_order_items(item_id);

-- Generate order numbers automatically
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'PO-' || TO_CHAR(NEW.order_date, 'YYYYMMDD') || '-' || LPAD(NEXTVAL('po_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();

-- Update total_amount when items change
CREATE OR REPLACE FUNCTION update_po_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_orders
  SET total_amount = (
    SELECT COALESCE(SUM(line_total), 0)
    FROM purchase_order_items
    WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_po_total_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_po_total();

-- RLS Policies
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
CREATE POLICY "Super admins can do anything with purchase orders"
  ON purchase_orders FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can do anything with purchase order items"
  ON purchase_order_items FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Users can access their organization's purchase orders
CREATE POLICY "Users can access their organization's purchase orders"
  ON purchase_orders FOR ALL TO authenticated
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

CREATE POLICY "Users can access their organization's purchase order items"
  ON purchase_order_items FOR ALL TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM purchase_orders po
      JOIN venues v ON po.venue_id = v.id
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  )
  WITH CHECK (
    purchase_order_id IN (
      SELECT po.id FROM purchase_orders po
      JOIN venues v ON po.venue_id = v.id
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

COMMENT ON TABLE purchase_orders IS 'Purchase orders placed with vendors';
COMMENT ON TABLE purchase_order_items IS 'Line items for purchase orders';
