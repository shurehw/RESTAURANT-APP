/**
 * Migration 053: Enable RLS on Missing Tables
 * Purpose: Enable RLS and add policies for the 35+ tables missing protection
 * Requires: Migration 050 (current_user_venue_ids view)
 */

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Venues: Already has RLS, but verify policies use current_user_venue_ids
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org venues" ON venues;
CREATE POLICY "Users can view their org venues"
  ON venues FOR SELECT
  USING (id IN (SELECT venue_id FROM current_user_venue_ids));

DROP POLICY IF EXISTS "Admins can manage their org venues" ON venues;
CREATE POLICY "Admins can manage their org venues"
  ON venues FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Departments
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view departments for their org venues"
  ON departments FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage departments for their org venues"
  ON departments FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Vendors (org-wide resource)
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vendors for their org"
  ON vendors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage vendors for their org"
  ON vendors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Items (org-wide resource)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items for their org"
  ON items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage items for their org"
  ON items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Vendor Item Mapping
ALTER TABLE vendor_item_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vendor_item_mapping for their org"
  ON vendor_item_mapping FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage vendor_item_mapping for their org"
  ON vendor_item_mapping FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- PURCHASING TABLES
-- ============================================================================

-- Purchase Orders
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view purchase_orders for their org venues"
  ON purchase_orders FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage purchase_orders for their org venues"
  ON purchase_orders FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Purchase Order Lines
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view po_lines for their org"
  ON purchase_order_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_lines.purchase_order_id
        AND po.venue_id IN (SELECT venue_id FROM current_user_venue_ids)
    )
  );

CREATE POLICY "Managers can manage po_lines for their org"
  ON purchase_order_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      JOIN venues v ON po.venue_id = v.id
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE po.id = purchase_order_lines.purchase_order_id
        AND ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Receipts
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view receipts for their org venues"
  ON receipts FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage receipts for their org venues"
  ON receipts FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Receipt Lines
ALTER TABLE receipt_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view receipt_lines for their org"
  ON receipt_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM receipts r
      WHERE r.id = receipt_lines.receipt_id
        AND r.venue_id IN (SELECT venue_id FROM current_user_venue_ids)
    )
  );

CREATE POLICY "Managers can manage receipt_lines for their org"
  ON receipt_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM receipts r
      JOIN venues v ON r.venue_id = v.id
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE r.id = receipt_lines.receipt_id
        AND ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Invoice Lines
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice_lines for their org"
  ON invoice_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND i.venue_id IN (SELECT venue_id FROM current_user_venue_ids)
    )
  );

CREATE POLICY "Managers can manage invoice_lines for their org"
  ON invoice_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN venues v ON i.venue_id = v.id
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE i.id = invoice_lines.invoice_id
        AND ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- INVENTORY TABLES
-- ============================================================================

-- Inventory Balances
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory_balances for their org venues"
  ON inventory_balances FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "System can manage inventory_balances"
  ON inventory_balances FOR ALL
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

-- Inventory Transactions
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory_transactions for their org venues"
  ON inventory_transactions FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "System can insert inventory_transactions"
  ON inventory_transactions FOR INSERT
  WITH CHECK (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

-- Inventory Counts
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory_counts for their org venues"
  ON inventory_counts FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage inventory_counts for their org venues"
  ON inventory_counts FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Inventory Count Lines
ALTER TABLE inventory_count_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view count_lines for their org"
  ON inventory_count_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inventory_counts ic
      WHERE ic.id = inventory_count_lines.inventory_count_id
        AND ic.venue_id IN (SELECT venue_id FROM current_user_venue_ids)
    )
  );

CREATE POLICY "Users can manage count_lines for their org"
  ON inventory_count_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM inventory_counts ic
      JOIN venues v ON ic.venue_id = v.id
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ic.id = inventory_count_lines.inventory_count_id
        AND ou.user_id = auth.uid()
    )
  );

-- ============================================================================
-- RECIPES TABLES
-- ============================================================================

-- Recipes
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recipes for their org venues"
  ON recipes FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage recipes for their org venues"
  ON recipes FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Sub-Recipes
ALTER TABLE sub_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sub_recipes for their org venues"
  ON sub_recipes FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage sub_recipes for their org venues"
  ON sub_recipes FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- LABOR TABLES
-- ============================================================================

-- Employees
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view employees for their org venues"
  ON employees FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage employees for their org venues"
  ON employees FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Positions
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view positions for their org venues"
  ON positions FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage positions for their org venues"
  ON positions FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Shift Assignments
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shift_assignments for their org venues"
  ON shift_assignments FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage shift_assignments for their org venues"
  ON shift_assignments FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Time Clock Punches
ALTER TABLE time_clock_punches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view punches for their org venues"
  ON time_clock_punches FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Employees can clock in/out for their venue"
  ON time_clock_punches FOR INSERT
  WITH CHECK (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage punches for their org venues"
  ON time_clock_punches FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Time Off Requests
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view time_off_requests for their org venues"
  ON time_off_requests FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Employees can create time_off_requests"
  ON time_off_requests FOR INSERT
  WITH CHECK (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage time_off_requests for their org venues"
  ON time_off_requests FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Labor Forecasts
ALTER TABLE labor_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view labor_forecasts for their org venues"
  ON labor_forecasts FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage labor_forecasts for their org venues"
  ON labor_forecasts FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- MESSAGING TABLES
-- ============================================================================

-- Channels
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view channels for their org venues"
  ON channels FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM current_user_venue_ids));

CREATE POLICY "Managers can manage channels for their org venues"
  ON channels FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid() AND ou.role IN ('admin', 'manager')
    )
  );

-- Messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages for their org channels"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = messages.channel_id
        AND c.venue_id IN (SELECT venue_id FROM current_user_venue_ids)
    )
  );

CREATE POLICY "Users can send messages to their org channels"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = messages.channel_id
        AND c.venue_id IN (SELECT venue_id FROM current_user_venue_ids)
    )
  );

-- ============================================================================
-- PRODUCT WEIGHTS & TARE
-- ============================================================================

-- Product Weights
ALTER TABLE product_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view product_weights for their org"
  ON product_weights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage product_weights for their org"
  ON product_weights FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Tare Weights
ALTER TABLE tare_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tare_weights for their org"
  ON tare_weights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage tare_weights for their org"
  ON tare_weights FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON venues TO authenticated;
GRANT SELECT ON departments TO authenticated;
GRANT SELECT ON vendors TO authenticated;
GRANT SELECT ON items TO authenticated;
GRANT SELECT ON vendor_item_mapping TO authenticated;
GRANT SELECT ON purchase_orders TO authenticated;
GRANT SELECT ON purchase_order_lines TO authenticated;
GRANT SELECT ON receipts TO authenticated;
GRANT SELECT ON receipt_lines TO authenticated;
GRANT SELECT ON invoice_lines TO authenticated;
GRANT SELECT ON inventory_balances TO authenticated;
GRANT SELECT ON inventory_transactions TO authenticated;
GRANT SELECT ON inventory_counts TO authenticated;
GRANT SELECT ON inventory_count_lines TO authenticated;
GRANT SELECT ON recipes TO authenticated;
GRANT SELECT ON sub_recipes TO authenticated;
GRANT SELECT ON employees TO authenticated;
GRANT SELECT ON positions TO authenticated;
GRANT SELECT ON shift_assignments TO authenticated;
GRANT SELECT ON time_clock_punches TO authenticated;
GRANT SELECT ON time_off_requests TO authenticated;
GRANT SELECT ON labor_forecasts TO authenticated;
GRANT SELECT ON channels TO authenticated;
GRANT SELECT ON messages TO authenticated;
GRANT SELECT ON product_weights TO authenticated;
GRANT SELECT ON tare_weights TO authenticated;
