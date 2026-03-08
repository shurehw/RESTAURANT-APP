-- ============================================================================
-- MIGRATION 276: Toast POS Venue Configuration
-- ============================================================================
-- Per-venue Toast API credentials and sync metadata.
-- Supports direct Toast API integration (not through TipSee middleware).
-- ============================================================================

CREATE TABLE IF NOT EXISTS toast_venue_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Venue link
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Toast API credentials (OAuth2 TOAST_MACHINE_CLIENT flow)
  restaurant_guid TEXT NOT NULL,             -- Toast-Restaurant-External-ID header value
  client_id TEXT NOT NULL,                   -- OAuth2 client ID
  client_secret_encrypted TEXT NOT NULL,     -- AES-256-GCM encrypted client secret
  api_base TEXT NOT NULL DEFAULT 'https://ws-api.toasttab.com',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Sync metadata
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT CHECK (last_sync_status IN ('success', 'error', 'partial')),
  last_sync_error TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT uq_toast_venue UNIQUE(venue_id),
  CONSTRAINT uq_toast_guid UNIQUE(restaurant_guid)
);

CREATE INDEX IF NOT EXISTS idx_toast_venue_config_active
  ON toast_venue_config(is_active) WHERE is_active = true;

-- RLS: service role only (API keys are sensitive)
ALTER TABLE toast_venue_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to toast_venue_config"
  ON toast_venue_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Platform admins can read (no API key in SELECT projections — handled at app layer)
CREATE POLICY "Authenticated users can view toast config"
  ON toast_venue_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = toast_venue_config.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON toast_venue_config TO authenticated;
GRANT ALL ON toast_venue_config TO service_role;

SELECT 'Toast venue config table created' AS status;

-- ── Seed Mistral Toast config ──────────────────────────────────────────────
-- Restaurant External ID: 729400
-- Client ID: hGAJ4JwcUu6mSDbQThIazq97foBUtf7q
-- Client secret is stored encrypted — seed with b64 placeholder, re-encrypt via app layer
INSERT INTO toast_venue_config (
  venue_id, restaurant_guid, client_id, client_secret_encrypted, is_active
)
SELECT
  v.id,
  'c511df4f-8267-4816-83c0-5ec371823200',
  'hGAJ4JwcUu6mSDbQThIazq97foBUtf7q',
  'b64:' || encode(convert_to('_GGGyOxgoI506nTZKXc9JWSzPR-JJzzmhRAJu6Moh0tz07SiNltguxW9HGOzoauh', 'UTF8'), 'base64'),
  true
FROM venues v WHERE v.name = 'Mistral'
ON CONFLICT ON CONSTRAINT uq_toast_venue DO UPDATE SET
  restaurant_guid = EXCLUDED.restaurant_guid,
  client_id = EXCLUDED.client_id,
  updated_at = NOW();
