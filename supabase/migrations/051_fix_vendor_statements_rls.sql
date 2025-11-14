/**
 * Migration 051: Fix Vendor Statements RLS Policies
 * Purpose: Replace overly permissive RLS policies with proper org-scoped isolation
 * Requires: Migration 050 (current_user_venue_ids view)
 */

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view vendor_statements" ON vendor_statements;
DROP POLICY IF EXISTS "Users can manage vendor_statements" ON vendor_statements;
DROP POLICY IF EXISTS "Users can view vendor_statement_lines" ON vendor_statement_lines;
DROP POLICY IF EXISTS "Users can manage vendor_statement_lines" ON vendor_statement_lines;

-- Vendor Statements: View access (all authenticated users in the org)
CREATE POLICY "Users can view vendor_statements for their org venues"
  ON vendor_statements FOR SELECT
  USING (
    venue_id IN (SELECT venue_id FROM current_user_venue_ids)
  );

-- Vendor Statements: Modify access (admin/manager only)
CREATE POLICY "Managers can manage vendor_statements for their org venues"
  ON vendor_statements FOR ALL
  USING (
    venue_id IN (
      SELECT v.id
      FROM venues v
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('admin', 'manager')
    )
  );

-- Vendor Statement Lines: View access (via parent statement)
CREATE POLICY "Users can view vendor_statement_lines for their org"
  ON vendor_statement_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendor_statements vs
      WHERE vs.id = vendor_statement_lines.vendor_statement_id
        AND vs.venue_id IN (SELECT venue_id FROM current_user_venue_ids)
    )
  );

-- Vendor Statement Lines: Modify access (admin/manager only, via parent statement)
CREATE POLICY "Managers can manage vendor_statement_lines for their org"
  ON vendor_statement_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vendor_statements vs
      JOIN venues v ON vs.venue_id = v.id
      JOIN organization_users ou ON v.organization_id = ou.organization_id
      WHERE vs.id = vendor_statement_lines.vendor_statement_id
        AND ou.user_id = auth.uid()
        AND ou.role IN ('admin', 'manager')
    )
  );

COMMENT ON POLICY "Users can view vendor_statements for their org venues" ON vendor_statements
  IS 'Users can view vendor statements for venues in their organization';
COMMENT ON POLICY "Managers can manage vendor_statements for their org venues" ON vendor_statements
  IS 'Admins and managers can create/update/delete vendor statements for their organization venues';
COMMENT ON POLICY "Users can view vendor_statement_lines for their org" ON vendor_statement_lines
  IS 'Users can view statement lines for statements in their organization';
COMMENT ON POLICY "Managers can manage vendor_statement_lines for their org" ON vendor_statement_lines
  IS 'Admins and managers can create/update/delete statement lines for their organization';
