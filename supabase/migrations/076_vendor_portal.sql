-- Migration: Vendor Portal
-- Description: Add vendor users table and RLS policies for vendor portal access

-- Create vendor_users table to map auth users to vendors
CREATE TABLE vendor_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, vendor_id)
);

CREATE INDEX idx_vendor_users_user ON vendor_users(user_id) WHERE is_active;
CREATE INDEX idx_vendor_users_vendor ON vendor_users(vendor_id) WHERE is_active;

COMMENT ON TABLE vendor_users IS 'Maps auth users to vendors for vendor portal access';

-- Enable RLS on vendor_users
ALTER TABLE vendor_users ENABLE ROW LEVEL SECURITY;

-- Vendor users can view their own mapping
DROP POLICY IF EXISTS vendor_users_select_own ON vendor_users;
CREATE POLICY vendor_users_select_own ON vendor_users
  FOR SELECT
  USING (auth.uid() = user_id);

-- Enable RLS on vendors for vendor portal (if not already enabled)
DO $$ BEGIN
  ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Vendors can view their own vendor record
DROP POLICY IF EXISTS vendors_select_own ON vendors;
CREATE POLICY vendors_select_own ON vendors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendor_users
      WHERE vendor_users.vendor_id = vendors.id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );

-- Vendors can view their own invoices
DROP POLICY IF EXISTS invoices_select_vendor ON invoices;
CREATE POLICY invoices_select_vendor ON invoices
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendor_users
      WHERE vendor_users.vendor_id = invoices.vendor_id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );

-- Vendors can view their own invoice lines
DROP POLICY IF EXISTS invoice_lines_select_vendor ON invoice_lines;
CREATE POLICY invoice_lines_select_vendor ON invoice_lines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN vendor_users ON vendor_users.vendor_id = invoices.vendor_id
      WHERE invoice_lines.invoice_id = invoices.id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );

-- Vendors can view venues (for invoice context)
DROP POLICY IF EXISTS venues_select_vendor ON venues;
CREATE POLICY venues_select_vendor ON venues
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN vendor_users ON vendor_users.vendor_id = invoices.vendor_id
      WHERE invoices.venue_id = venues.id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );

-- Allow vendors to insert invoices for their own vendor account
DROP POLICY IF EXISTS invoices_insert_vendor ON invoices;
CREATE POLICY invoices_insert_vendor ON invoices
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendor_users
      WHERE vendor_users.vendor_id = invoices.vendor_id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );

-- Allow vendors to insert invoice lines for their own invoices
DROP POLICY IF EXISTS invoice_lines_insert_vendor ON invoice_lines;
CREATE POLICY invoice_lines_insert_vendor ON invoice_lines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      JOIN vendor_users ON vendor_users.vendor_id = invoices.vendor_id
      WHERE invoice_lines.invoice_id = invoices.id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );

-- Vendor statements: vendors can view their own statements
DROP POLICY IF EXISTS vendor_statements_select_vendor ON vendor_statements;
CREATE POLICY vendor_statements_select_vendor ON vendor_statements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendor_users
      WHERE vendor_users.vendor_id = vendor_statements.vendor_id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );

-- Vendor statements: vendors can insert their own statements
DROP POLICY IF EXISTS vendor_statements_insert_vendor ON vendor_statements;
CREATE POLICY vendor_statements_insert_vendor ON vendor_statements
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendor_users
      WHERE vendor_users.vendor_id = vendor_statements.vendor_id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );

-- Vendor statement lines: vendors can view their own statement lines
DROP POLICY IF EXISTS vendor_statement_lines_select_vendor ON vendor_statement_lines;
CREATE POLICY vendor_statement_lines_select_vendor ON vendor_statement_lines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendor_statements
      JOIN vendor_users ON vendor_users.vendor_id = vendor_statements.vendor_id
      WHERE vendor_statement_lines.vendor_statement_id = vendor_statements.id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );

-- Vendor statement lines: vendors can insert lines for their own statements
DROP POLICY IF EXISTS vendor_statement_lines_insert_vendor ON vendor_statement_lines;
CREATE POLICY vendor_statement_lines_insert_vendor ON vendor_statement_lines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendor_statements
      JOIN vendor_users ON vendor_users.vendor_id = vendor_statements.vendor_id
      WHERE vendor_statement_lines.vendor_statement_id = vendor_statements.id
        AND vendor_users.user_id = auth.uid()
        AND vendor_users.is_active = true
    )
  );
