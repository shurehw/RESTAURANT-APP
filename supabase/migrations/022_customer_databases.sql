/**
 * Customer Database Connections
 * Stores connection details for customers with their own PostgreSQL databases
 */

-- Drop existing table if it exists (safe for initial setup)
DROP TABLE IF EXISTS customer_databases CASCADE;

-- Table to store customer database connection details
CREATE TABLE customer_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Connection details
  db_host TEXT NOT NULL,
  db_port INTEGER NOT NULL DEFAULT 5432,
  db_name TEXT NOT NULL,
  db_user TEXT NOT NULL,
  db_password_encrypted TEXT NOT NULL, -- Will be encrypted with application key

  -- SSL configuration
  db_ssl BOOLEAN NOT NULL DEFAULT true,
  db_ssl_mode TEXT DEFAULT 'require', -- disable, allow, prefer, require, verify-ca, verify-full

  -- Connection pool settings
  pool_min INTEGER DEFAULT 2,
  pool_max INTEGER DEFAULT 10,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_connection_test TIMESTAMPTZ,
  last_connection_status TEXT, -- 'success', 'failed', 'pending'
  connection_error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Ensure one database per organization
  UNIQUE(organization_id)
);

-- Index for fast lookups
CREATE INDEX idx_customer_databases_org ON customer_databases(organization_id);
CREATE INDEX idx_customer_databases_active ON customer_databases(is_active);

-- RLS policies
ALTER TABLE customer_databases ENABLE ROW LEVEL SECURITY;

-- Only owners/admins can view database connections
CREATE POLICY "Owners and admins can view customer databases"
  ON customer_databases
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_users
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Only owners can manage database connections
CREATE POLICY "Only owners can manage customer databases"
  ON customer_databases
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_users
      WHERE user_id = auth.uid()
      AND role = 'owner'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_users
      WHERE user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customer_databases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_databases_updated_at
  BEFORE UPDATE ON customer_databases
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_databases_updated_at();

-- Comments
COMMENT ON TABLE customer_databases IS 'Stores connection details for enterprise customers with their own PostgreSQL databases';
COMMENT ON COLUMN customer_databases.db_password_encrypted IS 'Encrypted password - decrypt using application encryption key';
COMMENT ON COLUMN customer_databases.last_connection_test IS 'Last time connection was tested';
COMMENT ON COLUMN customer_databases.last_connection_status IS 'Result of last connection test';
