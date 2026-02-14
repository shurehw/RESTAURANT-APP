/**
 * Migration 230: Procurement Settings + Purchasing Authorizations
 *
 * Two tables:
 *   1. procurement_settings — versioned org-level threshold configuration
 *      (follows comp_settings P0 pattern: immutable rows, version chain)
 *   2. purchasing_authorizations — per-user item-level purchasing permissions
 *      (real-time gate on PO creation)
 */

-- ============================================================================
-- 1. PROCUREMENT SETTINGS (versioned, org-level)
-- ============================================================================

CREATE TABLE IF NOT EXISTS procurement_settings (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,

  -- ══════════════════════════════════════════════════════════════════════════
  -- COST SPIKE DETECTION
  -- ══════════════════════════════════════════════════════════════════════════
  cost_spike_z_threshold NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  cost_spike_lookback_days INT NOT NULL DEFAULT 90,
  cost_spike_min_history INT NOT NULL DEFAULT 5,

  -- ══════════════════════════════════════════════════════════════════════════
  -- INVENTORY SHRINK
  -- ══════════════════════════════════════════════════════════════════════════
  shrink_cost_warning NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  shrink_cost_critical NUMERIC(10,2) NOT NULL DEFAULT 2000.00,

  -- ══════════════════════════════════════════════════════════════════════════
  -- RECIPE COST DRIFT
  -- ══════════════════════════════════════════════════════════════════════════
  recipe_drift_warning_pct NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  recipe_drift_critical_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  recipe_drift_lookback_days INT NOT NULL DEFAULT 30,

  -- ══════════════════════════════════════════════════════════════════════════
  -- PURCHASING RULES
  -- ══════════════════════════════════════════════════════════════════════════
  require_purchasing_authorization BOOLEAN NOT NULL DEFAULT FALSE,

  -- ══════════════════════════════════════════════════════════════════════════
  -- VERSION CONTROL (P0-grade audit trail)
  -- ══════════════════════════════════════════════════════════════════════════
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  superseded_by_version INT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (org_id, version)
);

-- Active version lookup
CREATE INDEX IF NOT EXISTS idx_procurement_settings_active
  ON procurement_settings(org_id, effective_from DESC)
  WHERE is_active = TRUE AND effective_to IS NULL;

-- Historical version lookup
CREATE INDEX IF NOT EXISTS idx_procurement_settings_historical
  ON procurement_settings(org_id, version DESC);

-- ============================================================================
-- 2. PURCHASING AUTHORIZATIONS (per-user, item-level)
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchasing_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,             -- auth.users (the purchaser)
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE, -- NULL = all venues in org

  -- Authorization scope
  authorized_item_ids UUID[] NOT NULL, -- specific items this user can purchase
  notes TEXT,                          -- admin notes ("Bar manager - glasses & barware only")

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique active authorization per user per venue (or org-wide)
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchasing_auth_unique
  ON purchasing_authorizations(org_id, user_id, COALESCE(venue_id, '00000000-0000-0000-0000-000000000000'))
  WHERE is_active = TRUE;

-- User lookup
CREATE INDEX IF NOT EXISTS idx_purchasing_auth_user
  ON purchasing_authorizations(user_id, is_active);

-- Org lookup
CREATE INDEX IF NOT EXISTS idx_purchasing_auth_org
  ON purchasing_authorizations(org_id, is_active);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE procurement_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchasing_authorizations ENABLE ROW LEVEL SECURITY;

-- Procurement settings: users can view their org's settings
CREATE POLICY procurement_settings_select ON procurement_settings
  FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Procurement settings: admins/owners can update
CREATE POLICY procurement_settings_update ON procurement_settings
  FOR UPDATE
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE AND role IN ('admin', 'owner')
    )
  );

-- Procurement settings: system can insert
CREATE POLICY procurement_settings_insert ON procurement_settings
  FOR INSERT
  WITH CHECK (TRUE);

-- Purchasing authorizations: users can read their own
CREATE POLICY purchasing_auth_select_own ON purchasing_authorizations
  FOR SELECT
  USING (user_id = auth.uid());

-- Purchasing authorizations: admins/owners can read all in org
CREATE POLICY purchasing_auth_select_admin ON purchasing_authorizations
  FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE AND role IN ('admin', 'owner')
    )
  );

-- Purchasing authorizations: admins/owners can manage
CREATE POLICY purchasing_auth_insert ON purchasing_authorizations
  FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY purchasing_auth_update ON purchasing_authorizations
  FOR UPDATE
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY purchasing_auth_delete ON purchasing_authorizations
  FOR DELETE
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE AND role IN ('admin', 'owner')
    )
  );

-- ============================================================================
-- 4. QUERY FUNCTIONS
-- ============================================================================

-- Get active procurement settings for an org
CREATE OR REPLACE FUNCTION get_active_procurement_settings(p_org_id UUID)
RETURNS SETOF procurement_settings AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM procurement_settings
  WHERE org_id = p_org_id
    AND is_active = TRUE
    AND effective_to IS NULL
  ORDER BY version DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE procurement_settings IS 'Versioned org-level procurement threshold configuration. Tunable rails within fixed enforcement standards.';
COMMENT ON TABLE purchasing_authorizations IS 'Per-user item-level purchasing permissions. Real-time gate on PO creation.';
COMMENT ON COLUMN purchasing_authorizations.authorized_item_ids IS 'UUID array of specific items this user is authorized to purchase';
COMMENT ON COLUMN procurement_settings.require_purchasing_authorization IS 'When TRUE, PO creation requires user to have a purchasing_authorization record covering all items';
