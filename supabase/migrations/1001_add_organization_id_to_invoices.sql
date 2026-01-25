-- Add organization_id to invoices table for multi-tenant isolation
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Backfill organization_id from venue
UPDATE invoices i
SET organization_id = v.organization_id
FROM venues v
WHERE i.venue_id = v.id
AND i.organization_id IS NULL;

-- Make organization_id required going forward
ALTER TABLE invoices ALTER COLUMN organization_id SET NOT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON invoices(organization_id);

-- Update RLS policies to use organization_id
DROP POLICY IF EXISTS "Users can view invoices for their organization" ON invoices;
CREATE POLICY "Users can view invoices for their organization"
  ON invoices FOR SELECT
  USING (organization_id IN (SELECT id FROM organizations WHERE id = auth.jwt() -> 'organization_id'));

DROP POLICY IF EXISTS "Users can insert invoices for their organization" ON invoices;
CREATE POLICY "Users can insert invoices for their organization"
  ON invoices FOR INSERT
  WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE id = auth.jwt() -> 'organization_id'));

DROP POLICY IF EXISTS "Users can update invoices for their organization" ON invoices;
CREATE POLICY "Users can update invoices for their organization"
  ON invoices FOR UPDATE
  USING (organization_id IN (SELECT id FROM organizations WHERE id = auth.jwt() -> 'organization_id'));
