-- ORDERING RLS - Step by step

-- Enable RLS on all tables
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_tolerances ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmapped_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_item_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_pars ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_cost_history ENABLE ROW LEVEL SECURITY;

SELECT 'STEP 1: RLS enabled on all tables' as status;

-- PURCHASE ORDERS RLS
DROP POLICY IF EXISTS "Super admins full access purchase_orders" ON purchase_orders;
CREATE POLICY "Super admins full access purchase_orders"
  ON purchase_orders FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Org users access purchase_orders" ON purchase_orders;
CREATE POLICY "Org users access purchase_orders"
  ON purchase_orders FOR ALL TO authenticated
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  );

SELECT 'STEP 2: purchase_orders RLS OK' as status;

-- PURCHASE ORDER ITEMS RLS
DROP POLICY IF EXISTS "Super admins full access purchase_order_items" ON purchase_order_items;
CREATE POLICY "Super admins full access purchase_order_items"
  ON purchase_order_items FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Org users access purchase_order_items" ON purchase_order_items;
CREATE POLICY "Org users access purchase_order_items"
  ON purchase_order_items FOR ALL TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM purchase_orders po
      WHERE po.venue_id IN (
        SELECT v.id FROM venues v
        WHERE v.organization_id IN (
          SELECT ou.organization_id FROM organization_users ou
          WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        )
      )
    )
  )
  WITH CHECK (
    purchase_order_id IN (
      SELECT po.id FROM purchase_orders po
      WHERE po.venue_id IN (
        SELECT v.id FROM venues v
        WHERE v.organization_id IN (
          SELECT ou.organization_id FROM organization_users ou
          WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        )
      )
    )
  );

SELECT 'STEP 3: purchase_order_items RLS OK' as status;

-- RECEIPTS RLS
DROP POLICY IF EXISTS "Super admins full access receipts" ON receipts;
CREATE POLICY "Super admins full access receipts"
  ON receipts FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Org users access receipts" ON receipts;
CREATE POLICY "Org users access receipts"
  ON receipts FOR ALL TO authenticated
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  );

SELECT 'STEP 4: receipts RLS OK' as status;

-- RECEIPT LINES RLS
DROP POLICY IF EXISTS "Super admins full access receipt_lines" ON receipt_lines;
CREATE POLICY "Super admins full access receipt_lines"
  ON receipt_lines FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Org users access receipt_lines" ON receipt_lines;
CREATE POLICY "Org users access receipt_lines"
  ON receipt_lines FOR ALL TO authenticated
  USING (
    receipt_id IN (
      SELECT r.id FROM receipts r
      WHERE r.venue_id IN (
        SELECT v.id FROM venues v
        WHERE v.organization_id IN (
          SELECT ou.organization_id FROM organization_users ou
          WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        )
      )
    )
  )
  WITH CHECK (
    receipt_id IN (
      SELECT r.id FROM receipts r
      WHERE r.venue_id IN (
        SELECT v.id FROM venues v
        WHERE v.organization_id IN (
          SELECT ou.organization_id FROM organization_users ou
          WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        )
      )
    )
  );

SELECT 'STEP 5: receipt_lines RLS OK' as status;

-- SIMPLE TABLES (global read access)
DROP POLICY IF EXISTS "Super admins full access vendor_tolerances" ON vendor_tolerances;
CREATE POLICY "Super admins full access vendor_tolerances"
  ON vendor_tolerances FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Users view vendor_tolerances" ON vendor_tolerances;
CREATE POLICY "Users view vendor_tolerances"
  ON vendor_tolerances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admins full access unmapped_items" ON unmapped_items;
CREATE POLICY "Super admins full access unmapped_items"
  ON unmapped_items FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Users view unmapped_items" ON unmapped_items;
CREATE POLICY "Users view unmapped_items"
  ON unmapped_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admins full access vendor_item_aliases" ON vendor_item_aliases;
CREATE POLICY "Super admins full access vendor_item_aliases"
  ON vendor_item_aliases FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Users manage vendor_item_aliases" ON vendor_item_aliases;
CREATE POLICY "Users manage vendor_item_aliases"
  ON vendor_item_aliases FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

SELECT 'STEP 6: simple tables RLS OK' as status;

-- INVOICE VARIANCES RLS
DROP POLICY IF EXISTS "Super admins full access invoice_variances" ON invoice_variances;
CREATE POLICY "Super admins full access invoice_variances"
  ON invoice_variances FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Org users access invoice_variances" ON invoice_variances;
CREATE POLICY "Org users access invoice_variances"
  ON invoice_variances FOR ALL TO authenticated
  USING (
    invoice_id IN (
      SELECT inv.id FROM invoices inv
      WHERE inv.venue_id IN (
        SELECT v.id FROM venues v
        WHERE v.organization_id IN (
          SELECT ou.organization_id FROM organization_users ou
          WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        )
      )
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT inv.id FROM invoices inv
      WHERE inv.venue_id IN (
        SELECT v.id FROM venues v
        WHERE v.organization_id IN (
          SELECT ou.organization_id FROM organization_users ou
          WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
        )
      )
    )
  );

SELECT 'STEP 7: invoice_variances RLS OK' as status;

-- INVENTORY BALANCES RLS
DROP POLICY IF EXISTS "Super admins full access inventory_balances" ON inventory_balances;
CREATE POLICY "Super admins full access inventory_balances"
  ON inventory_balances FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Org users access inventory_balances" ON inventory_balances;
CREATE POLICY "Org users access inventory_balances"
  ON inventory_balances FOR ALL TO authenticated
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  );

SELECT 'STEP 8: inventory_balances RLS OK' as status;

-- INVENTORY TRANSACTIONS RLS
DROP POLICY IF EXISTS "Super admins full access inventory_transactions" ON inventory_transactions;
CREATE POLICY "Super admins full access inventory_transactions"
  ON inventory_transactions FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Org users access inventory_transactions" ON inventory_transactions;
CREATE POLICY "Org users access inventory_transactions"
  ON inventory_transactions FOR ALL TO authenticated
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  );

SELECT 'STEP 9: inventory_transactions RLS OK' as status;

-- ITEM PARS RLS
DROP POLICY IF EXISTS "Super admins full access item_pars" ON item_pars;
CREATE POLICY "Super admins full access item_pars"
  ON item_pars FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Org users access item_pars" ON item_pars;
CREATE POLICY "Org users access item_pars"
  ON item_pars FOR ALL TO authenticated
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  );

SELECT 'STEP 10: item_pars RLS OK' as status;

-- ITEM COST HISTORY RLS
DROP POLICY IF EXISTS "Super admins full access item_cost_history" ON item_cost_history;
CREATE POLICY "Super admins full access item_cost_history"
  ON item_cost_history FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Org users access item_cost_history" ON item_cost_history;
CREATE POLICY "Org users access item_cost_history"
  ON item_cost_history FOR ALL TO authenticated
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT ou.organization_id FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  );

SELECT 'STEP 11: item_cost_history RLS OK' as status;

SELECT 'ALL RLS POLICIES CREATED!' as final_status;
