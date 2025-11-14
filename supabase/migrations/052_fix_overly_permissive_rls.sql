/**
 * Migration 052: Fix Overly Permissive RLS Policies
 * Purpose: Replace USING (true) policies with proper org-scoped isolation
 * Affects: pos_sales, invoices, organization_settings, http_idempotency, savings_events
 * Requires: Migration 050 (current_user_venue_ids view)
 */

-- ============================================================================
-- POS SALES
-- ============================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view pos_sales" ON pos_sales;
DROP POLICY IF EXISTS "Users can manage pos_sales" ON pos_sales;

-- POS Sales: View access (org-scoped)
CREATE POLICY "Users can view pos_sales for their org venues"
  ON pos_sales FOR SELECT
  USING (
    venue_id IN (SELECT venue_id FROM current_user_venue_ids)
  );

-- POS Sales: Insert access (system and managers)
CREATE POLICY "System can insert pos_sales"
  ON pos_sales FOR INSERT
  WITH CHECK (
    venue_id IN (SELECT venue_id FROM current_user_venue_ids)
  );

-- POS Sales: Update access (managers only for corrections)
CREATE POLICY "Managers can update pos_sales for their org venues"
  ON pos_sales FOR UPDATE
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- INVOICES
-- ============================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view invoices" ON invoices;
DROP POLICY IF EXISTS "Users can manage invoices" ON invoices;

-- Invoices: View access (org-scoped)
CREATE POLICY "Users can view invoices for their org venues"
  ON invoices FOR SELECT
  USING (
    venue_id IN (SELECT venue_id FROM current_user_venue_ids)
  );

-- Invoices: Modify access (admin/manager only)
CREATE POLICY "Managers can manage invoices for their org venues"
  ON invoices FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- ORGANIZATION SETTINGS
-- ============================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view organization_settings" ON organization_settings;
DROP POLICY IF EXISTS "Users can manage organization_settings" ON organization_settings;

-- Organization Settings: View access (org members only)
CREATE POLICY "Users can view settings for their organization"
  ON organization_settings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid()
    )
  );

-- Organization Settings: Modify access (admins only)
CREATE POLICY "Admins can manage settings for their organization"
  ON organization_settings FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- ============================================================================
-- HTTP IDEMPOTENCY
-- ============================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view http_idempotency" ON http_idempotency;
DROP POLICY IF EXISTS "System can manage http_idempotency" ON http_idempotency;

-- HTTP Idempotency: Users can only see their own keys
CREATE POLICY "Users can view their own idempotency keys"
  ON http_idempotency FOR SELECT
  USING (
    created_by = auth.uid()
  );

-- HTTP Idempotency: Users can only create their own keys
CREATE POLICY "Users can create their own idempotency keys"
  ON http_idempotency FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
  );

-- Add created_by column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'http_idempotency'
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE http_idempotency ADD COLUMN created_by UUID REFERENCES auth.users(id);
    CREATE INDEX idx_http_idempotency_created_by ON http_idempotency(created_by);
  END IF;
END $$;

-- ============================================================================
-- SAVINGS EVENTS
-- ============================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view savings_events" ON savings_events;
DROP POLICY IF EXISTS "Users can manage savings_events" ON savings_events;

-- Savings Events: View access (org-scoped via venue)
CREATE POLICY "Users can view savings_events for their org venues"
  ON savings_events FOR SELECT
  USING (
    venue_id IN (SELECT venue_id FROM current_user_venue_ids)
  );

-- Savings Events: System can insert (triggered by automated calculations)
CREATE POLICY "System can insert savings_events"
  ON savings_events FOR INSERT
  WITH CHECK (
    venue_id IN (SELECT venue_id FROM current_user_venue_ids)
  );

-- Savings Events: Managers can delete incorrect entries
CREATE POLICY "Managers can delete savings_events for their org venues"
  ON savings_events FOR DELETE
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Users can view pos_sales for their org venues" ON pos_sales
  IS 'Users can view POS sales for venues in their organization';
COMMENT ON POLICY "System can insert pos_sales" ON pos_sales
  IS 'POS integrations and users can insert sales for venues they have access to';
COMMENT ON POLICY "Managers can update pos_sales for their org venues" ON pos_sales
  IS 'Managers can update POS sales for corrections';

COMMENT ON POLICY "Users can view invoices for their org venues" ON invoices
  IS 'Users can view invoices for venues in their organization';
COMMENT ON POLICY "Managers can manage invoices for their org venues" ON invoices
  IS 'Admins and managers can create/update/delete invoices';

COMMENT ON POLICY "Users can view settings for their organization" ON organization_settings
  IS 'Users can view settings for their organization';
COMMENT ON POLICY "Admins can manage settings for their organization" ON organization_settings
  IS 'Only admins can modify organization settings';

COMMENT ON POLICY "Users can view their own idempotency keys" ON http_idempotency
  IS 'Users can only view idempotency keys they created';
COMMENT ON POLICY "Users can create their own idempotency keys" ON http_idempotency
  IS 'Users can create idempotency keys for their own requests';

COMMENT ON POLICY "Users can view savings_events for their org venues" ON savings_events
  IS 'Users can view savings events for venues in their organization';
COMMENT ON POLICY "System can insert savings_events" ON savings_events
  IS 'Automated systems can insert savings events for accessible venues';
COMMENT ON POLICY "Managers can delete savings_events for their org venues" ON savings_events
  IS 'Managers can delete incorrect savings entries';
