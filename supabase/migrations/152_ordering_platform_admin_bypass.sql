-- ============================================================================
-- PLATFORM ADMIN RLS BYPASS FOR ORDERING TABLES
-- Extends 149_platform_admin_bypass.sql with ordering/receiving/inventory tables
-- Only creates policies for tables that exist
-- ============================================================================

-- ============================================================================
-- PURCHASE_ORDERS - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders') THEN
    DROP POLICY IF EXISTS "Platform admins can view all purchase orders" ON purchase_orders;
    CREATE POLICY "Platform admins can view all purchase orders"
      ON purchase_orders FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all purchase orders" ON purchase_orders;
    CREATE POLICY "Platform admins can manage all purchase orders"
      ON purchase_orders FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for purchase_orders';
  ELSE
    RAISE NOTICE 'Skipping purchase_orders - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- PURCHASE_ORDER_ITEMS - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items') THEN
    DROP POLICY IF EXISTS "Platform admins can view all purchase order items" ON purchase_order_items;
    CREATE POLICY "Platform admins can view all purchase order items"
      ON purchase_order_items FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all purchase order items" ON purchase_order_items;
    CREATE POLICY "Platform admins can manage all purchase order items"
      ON purchase_order_items FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for purchase_order_items';
  ELSE
    RAISE NOTICE 'Skipping purchase_order_items - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- RECEIPTS - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipts') THEN
    DROP POLICY IF EXISTS "Platform admins can view all receipts" ON receipts;
    CREATE POLICY "Platform admins can view all receipts"
      ON receipts FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all receipts" ON receipts;
    CREATE POLICY "Platform admins can manage all receipts"
      ON receipts FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for receipts';
  ELSE
    RAISE NOTICE 'Skipping receipts - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- RECEIPT_LINES - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_lines') THEN
    DROP POLICY IF EXISTS "Platform admins can view all receipt lines" ON receipt_lines;
    CREATE POLICY "Platform admins can view all receipt lines"
      ON receipt_lines FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all receipt lines" ON receipt_lines;
    CREATE POLICY "Platform admins can manage all receipt lines"
      ON receipt_lines FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for receipt_lines';
  ELSE
    RAISE NOTICE 'Skipping receipt_lines - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- ITEM_PARS - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_pars') THEN
    DROP POLICY IF EXISTS "Platform admins can view all item pars" ON item_pars;
    CREATE POLICY "Platform admins can view all item pars"
      ON item_pars FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all item pars" ON item_pars;
    CREATE POLICY "Platform admins can manage all item pars"
      ON item_pars FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for item_pars';
  ELSE
    RAISE NOTICE 'Skipping item_pars - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- INVENTORY_BALANCES - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_balances') THEN
    DROP POLICY IF EXISTS "Platform admins can view all inventory balances" ON inventory_balances;
    CREATE POLICY "Platform admins can view all inventory balances"
      ON inventory_balances FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all inventory balances" ON inventory_balances;
    CREATE POLICY "Platform admins can manage all inventory balances"
      ON inventory_balances FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for inventory_balances';
  ELSE
    RAISE NOTICE 'Skipping inventory_balances - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- INVENTORY_TRANSACTIONS - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_transactions') THEN
    DROP POLICY IF EXISTS "Platform admins can view all inventory transactions" ON inventory_transactions;
    CREATE POLICY "Platform admins can view all inventory transactions"
      ON inventory_transactions FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all inventory transactions" ON inventory_transactions;
    CREATE POLICY "Platform admins can manage all inventory transactions"
      ON inventory_transactions FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for inventory_transactions';
  ELSE
    RAISE NOTICE 'Skipping inventory_transactions - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- ITEM_COST_HISTORY - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_cost_history') THEN
    DROP POLICY IF EXISTS "Platform admins can view all item cost history" ON item_cost_history;
    CREATE POLICY "Platform admins can view all item cost history"
      ON item_cost_history FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all item cost history" ON item_cost_history;
    CREATE POLICY "Platform admins can manage all item cost history"
      ON item_cost_history FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for item_cost_history';
  ELSE
    RAISE NOTICE 'Skipping item_cost_history - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- VENDOR_ITEM_ALIASES - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_item_aliases') THEN
    DROP POLICY IF EXISTS "Platform admins can view all vendor item aliases" ON vendor_item_aliases;
    CREATE POLICY "Platform admins can view all vendor item aliases"
      ON vendor_item_aliases FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all vendor item aliases" ON vendor_item_aliases;
    CREATE POLICY "Platform admins can manage all vendor item aliases"
      ON vendor_item_aliases FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for vendor_item_aliases';
  ELSE
    RAISE NOTICE 'Skipping vendor_item_aliases - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- UNMAPPED_ITEMS - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'unmapped_items') THEN
    DROP POLICY IF EXISTS "Platform admins can view all unmapped items" ON unmapped_items;
    CREATE POLICY "Platform admins can view all unmapped items"
      ON unmapped_items FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all unmapped items" ON unmapped_items;
    CREATE POLICY "Platform admins can manage all unmapped items"
      ON unmapped_items FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for unmapped_items';
  ELSE
    RAISE NOTICE 'Skipping unmapped_items - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- INVOICE_VARIANCES - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_variances') THEN
    DROP POLICY IF EXISTS "Platform admins can view all invoice variances" ON invoice_variances;
    CREATE POLICY "Platform admins can view all invoice variances"
      ON invoice_variances FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all invoice variances" ON invoice_variances;
    CREATE POLICY "Platform admins can manage all invoice variances"
      ON invoice_variances FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for invoice_variances';
  ELSE
    RAISE NOTICE 'Skipping invoice_variances - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- VENDOR_TOLERANCES - Platform admins can see all
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_tolerances') THEN
    DROP POLICY IF EXISTS "Platform admins can view all vendor tolerances" ON vendor_tolerances;
    CREATE POLICY "Platform admins can view all vendor tolerances"
      ON vendor_tolerances FOR SELECT
      USING (is_platform_admin());

    DROP POLICY IF EXISTS "Platform admins can manage all vendor tolerances" ON vendor_tolerances;
    CREATE POLICY "Platform admins can manage all vendor tolerances"
      ON vendor_tolerances FOR ALL
      USING (is_platform_admin())
      WITH CHECK (is_platform_admin());
    
    RAISE NOTICE 'Created policies for vendor_tolerances';
  ELSE
    RAISE NOTICE 'Skipping vendor_tolerances - table does not exist';
  END IF;
END $$;

-- ============================================================================
-- DONE
-- ============================================================================

SELECT 'Ordering platform admin bypass migration completed' as status;
