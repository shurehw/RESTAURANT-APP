-- Add organization_id to vendors table for multi-tenant isolation
-- This prevents vendors from being shared across different restaurant groups

-- Step 1: Add organization_id column (nullable initially)
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Step 2: Backfill organization_id based on existing invoice usage
-- For each vendor, find which organization has used them (via invoices -> venues -> organization)
DO $$
DECLARE
  vendor_record RECORD;
  org_id UUID;
BEGIN
  FOR vendor_record IN
    SELECT DISTINCT v.id, v.name
    FROM vendors v
    WHERE v.organization_id IS NULL
  LOOP
    -- Find the organization that uses this vendor (via invoices)
    SELECT DISTINCT ven.organization_id INTO org_id
    FROM invoices i
    JOIN venues ven ON i.venue_id = ven.id
    WHERE i.vendor_id = vendor_record.id
    LIMIT 1;

    -- If found, assign it
    IF org_id IS NOT NULL THEN
      UPDATE vendors
      SET organization_id = org_id
      WHERE id = vendor_record.id;

      RAISE NOTICE 'Assigned vendor "%" to org %', vendor_record.name, org_id;
    ELSE
      -- If no invoices found, assign to first organization (default)
      SELECT id INTO org_id FROM organizations ORDER BY created_at LIMIT 1;

      UPDATE vendors
      SET organization_id = org_id
      WHERE id = vendor_record.id;

      RAISE NOTICE 'Assigned vendor "%" to default org % (no invoices)', vendor_record.name, org_id;
    END IF;
  END LOOP;
END $$;

-- Step 3: Make organization_id required
ALTER TABLE vendors ALTER COLUMN organization_id SET NOT NULL;

-- Step 4: Add index for performance
CREATE INDEX IF NOT EXISTS idx_vendors_organization ON vendors(organization_id, is_active);

-- Step 5: Drop old unique constraint and add new one scoped to organization
DROP INDEX IF EXISTS idx_vendors_normalized;
CREATE UNIQUE INDEX idx_vendors_normalized_per_org
  ON vendors(organization_id, normalized_name)
  WHERE is_active;

-- Step 6: Update RLS policies to use organization_id
DROP POLICY IF EXISTS "Users can view vendors for their org" ON vendors;
DROP POLICY IF EXISTS "Managers can manage vendors for their org" ON vendors;

CREATE POLICY "Users can view vendors for their org"
  ON vendors FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Managers can manage vendors for their org"
  ON vendors FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'admin', 'manager')
    )
  );

COMMENT ON COLUMN vendors.organization_id IS 'Organization that owns this vendor - enables multi-tenant isolation';
