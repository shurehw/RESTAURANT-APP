-- Fix items table to properly isolate by organization
-- Problem: SKU is globally unique, should be unique per org
-- Solution: Drop global unique constraint, add composite unique constraint

-- 1. Drop the global UNIQUE constraint on sku
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_sku_key;

-- 2. Make organization_id NOT NULL (required for proper isolation)
-- First, ensure all items have an org_id (backfill if needed)
UPDATE items
SET organization_id = (
  SELECT organization_id
  FROM organization_users
  WHERE is_active = true
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE items
  ALTER COLUMN organization_id SET NOT NULL;

-- 3. Add composite unique constraint: sku must be unique per organization
ALTER TABLE items
  ADD CONSTRAINT items_sku_org_unique UNIQUE (organization_id, sku);

-- 4. Update RLS policies to ensure org isolation
DROP POLICY IF EXISTS "Users can view items for their organization" ON items;
DROP POLICY IF EXISTS "Users can insert items for their organization" ON items;
DROP POLICY IF EXISTS "Users can update items for their organization" ON items;
DROP POLICY IF EXISTS "Users can delete items for their organization" ON items;

-- Enable RLS if not already enabled
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Create org-scoped RLS policies
CREATE POLICY "Users can view items for their organization"
  ON items FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can insert items for their organization"
  ON items FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can update items for their organization"
  ON items FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can delete items for their organization"
  ON items FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 5. Add index for performance on org_id queries
CREATE INDEX IF NOT EXISTS idx_items_organization_id ON items(organization_id, is_active) WHERE is_active = true;

COMMENT ON CONSTRAINT items_sku_org_unique ON items IS 'SKU must be unique within an organization, but can be reused across orgs';
