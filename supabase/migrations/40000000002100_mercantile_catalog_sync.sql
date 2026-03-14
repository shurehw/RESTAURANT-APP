-- Mercantile Desk catalog sync
-- Tracks items synced from the Mercantile Desk brand standards platform.
-- When an org uses both OpsOS and Mercantile Desk, approved branded items
-- are synced here so managers can order them through normal procurement.

-- Track which items originated from Mercantile Desk
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS mercantile_product_id TEXT,
  ADD COLUMN IF NOT EXISTS mercantile_variant_id TEXT,
  ADD COLUMN IF NOT EXISTS mercantile_synced_at TIMESTAMPTZ;

-- Index for fast lookup during sync (upsert by mercantile_product_id + org)
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_mercantile_product_org
  ON items (organization_id, mercantile_product_id)
  WHERE mercantile_product_id IS NOT NULL;

-- Organization-level integration settings for Mercantile Desk
CREATE TABLE IF NOT EXISTS mercantile_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mercantile_org_id TEXT NOT NULL,        -- org ID in Medusa/Mercantile
  api_key TEXT NOT NULL,                  -- shared secret for webhook auth
  catalog_sync_enabled BOOLEAN DEFAULT true,
  enforce_catalog_only BOOLEAN DEFAULT true, -- block POs for off-catalog branded items
  default_vendor_id UUID REFERENCES vendors(id), -- vendor for branded item POs
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id)
);

-- RLS: org-scoped
ALTER TABLE mercantile_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org mercantile integration"
  ON mercantile_integrations FOR SELECT
  USING (
    organization_id IN (
      SELECT ou.organization_id FROM organization_users ou
      WHERE ou.user_id = auth.uid()
    )
    OR is_super_admin()
  );

CREATE POLICY "Admins can manage mercantile integration"
  ON mercantile_integrations FOR ALL
  USING (
    organization_id IN (
      SELECT ou.organization_id FROM organization_users ou
      WHERE ou.user_id = auth.uid() AND ou.role IN ('owner', 'admin')
    )
    OR is_super_admin()
  );
