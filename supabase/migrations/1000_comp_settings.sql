-- ============================================================================
-- COMP SETTINGS: TUNABLE ENFORCEMENT RAILS FOR OPSOPS
-- Enables organization-level configuration of comp policies, thresholds,
-- and approval workflows. Supports version control for audit trails.
-- ============================================================================

-- ============================================================================
-- 1. CREATE COMP_SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS comp_settings (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,

  -- ══════════════════════════════════════════════════════════════════════════
  -- APPROVED COMP REASONS
  -- ══════════════════════════════════════════════════════════════════════════
  -- Customizable list of approved comp reasons for this organization.
  -- Each reason can have optional metadata (e.g., requires_manager_approval, max_amount)
  approved_reasons JSONB NOT NULL DEFAULT '[
    {"name": "Drink Tickets", "requires_manager_approval": false, "max_amount": null},
    {"name": "Promoter / Customer Development", "requires_manager_approval": true, "max_amount": null},
    {"name": "Guest Recovery", "requires_manager_approval": false, "max_amount": 100},
    {"name": "Black Card", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 10%", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 20%", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 25%", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 30%", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 50%", "requires_manager_approval": true, "max_amount": null},
    {"name": "Executive/Partner Comps", "requires_manager_approval": true, "max_amount": null},
    {"name": "Goodwill", "requires_manager_approval": false, "max_amount": 75},
    {"name": "DNL (Did Not Like)", "requires_manager_approval": false, "max_amount": 50},
    {"name": "Spill / Broken items", "requires_manager_approval": false, "max_amount": 50},
    {"name": "FOH Mistake", "requires_manager_approval": false, "max_amount": 75},
    {"name": "BOH Mistake / Wrong Temp", "requires_manager_approval": false, "max_amount": 75},
    {"name": "Barbuy", "requires_manager_approval": true, "max_amount": null},
    {"name": "Performer / Band / DJ", "requires_manager_approval": true, "max_amount": null},
    {"name": "Media / PR / Celebrity", "requires_manager_approval": true, "max_amount": null},
    {"name": "Manager Meal", "requires_manager_approval": false, "max_amount": 30}
  ]'::JSONB,

  -- ══════════════════════════════════════════════════════════════════════════
  -- THRESHOLD SETTINGS
  -- ══════════════════════════════════════════════════════════════════════════
  -- What constitutes a "high value" comp requiring extra scrutiny
  high_value_comp_threshold NUMERIC(10,2) NOT NULL DEFAULT 200.00,

  -- What percentage of check total is considered excessive
  high_comp_pct_threshold NUMERIC(5,2) NOT NULL DEFAULT 50.00,

  -- Daily comp % thresholds (as % of net sales)
  daily_comp_pct_warning NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  daily_comp_pct_critical NUMERIC(5,2) NOT NULL DEFAULT 3.00,

  -- ══════════════════════════════════════════════════════════════════════════
  -- AUTHORITY LEVELS
  -- ══════════════════════════════════════════════════════════════════════════
  -- Maximum comp amount a server can approve without manager sign-off
  server_max_comp_amount NUMERIC(10,2) NOT NULL DEFAULT 50.00,

  -- Minimum amount that requires manager-level authority
  manager_min_for_high_value NUMERIC(10,2) NOT NULL DEFAULT 200.00,

  -- Roles considered "managers" (for authority checks)
  manager_roles JSONB NOT NULL DEFAULT '["Manager", "General Manager", "Assistant Manager", "AGM", "GM"]'::JSONB,

  -- ══════════════════════════════════════════════════════════════════════════
  -- AI MODEL CONFIGURATION
  -- ══════════════════════════════════════════════════════════════════════════
  -- Which Claude model to use for comp reviews
  ai_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',

  -- Max tokens for AI response
  ai_max_tokens INT NOT NULL DEFAULT 4000,

  -- Temperature for AI model (0.0 = deterministic, 1.0 = creative)
  ai_temperature NUMERIC(3,2) NOT NULL DEFAULT 0.30,

  -- ══════════════════════════════════════════════════════════════════════════
  -- VERSION CONTROL (P0-grade audit trail)
  -- ══════════════════════════════════════════════════════════════════════════
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  superseded_by_org_id UUID,
  superseded_by_version INT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (org_id, version)
);

-- Add foreign key for version chain
ALTER TABLE comp_settings
  ADD CONSTRAINT comp_settings_superseded_by_fkey
  FOREIGN KEY (superseded_by_org_id, superseded_by_version)
  REFERENCES comp_settings(org_id, version)
  ON DELETE SET NULL;

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Active version lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_comp_settings_active
  ON comp_settings(org_id, effective_from DESC)
  WHERE is_active = TRUE AND effective_to IS NULL;

-- Historical version lookup (audit queries)
CREATE INDEX IF NOT EXISTS idx_comp_settings_historical
  ON comp_settings(org_id, version DESC);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE comp_settings ENABLE ROW LEVEL SECURITY;

-- Users can view settings for their organization
CREATE POLICY "Users can view comp settings for their organization"
  ON comp_settings FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Only org admins can update settings
CREATE POLICY "Org admins can update comp settings"
  ON comp_settings FOR UPDATE
  USING (
    org_id IN (
      SELECT ou.organization_id FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.is_active = TRUE
        AND ou.role IN ('admin', 'owner')
    )
  );

-- System can insert settings (for seed data)
CREATE POLICY "System can insert comp settings"
  ON comp_settings FOR INSERT
  WITH CHECK (TRUE);

-- ============================================================================
-- 4. VERSION-AWARE QUERY FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_comp_settings_at(
  p_org_id UUID,
  p_as_of TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE (
  org_id UUID,
  version INT,
  approved_reasons JSONB,
  high_value_comp_threshold NUMERIC,
  high_comp_pct_threshold NUMERIC,
  daily_comp_pct_warning NUMERIC,
  daily_comp_pct_critical NUMERIC,
  server_max_comp_amount NUMERIC,
  manager_min_for_high_value NUMERIC,
  manager_roles JSONB,
  ai_model TEXT,
  ai_max_tokens INT,
  ai_temperature NUMERIC,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.org_id,
    s.version,
    s.approved_reasons,
    s.high_value_comp_threshold,
    s.high_comp_pct_threshold,
    s.daily_comp_pct_warning,
    s.daily_comp_pct_critical,
    s.server_max_comp_amount,
    s.manager_min_for_high_value,
    s.manager_roles,
    s.ai_model,
    s.ai_max_tokens,
    s.ai_temperature,
    s.effective_from,
    s.effective_to
  FROM comp_settings s
  WHERE s.org_id = p_org_id
    AND s.is_active = TRUE
    AND s.effective_from <= p_as_of
    AND (s.effective_to IS NULL OR s.effective_to > p_as_of)
  ORDER BY s.effective_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_comp_settings_at IS 'Retrieves comp settings version active at a specific point in time';

-- ============================================================================
-- 5. CONVENIENCE FUNCTION: GET ACTIVE SETTINGS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_active_comp_settings(
  p_org_id UUID
) RETURNS TABLE (
  org_id UUID,
  version INT,
  approved_reasons JSONB,
  high_value_comp_threshold NUMERIC,
  high_comp_pct_threshold NUMERIC,
  daily_comp_pct_warning NUMERIC,
  daily_comp_pct_critical NUMERIC,
  server_max_comp_amount NUMERIC,
  manager_min_for_high_value NUMERIC,
  manager_roles JSONB,
  ai_model TEXT,
  ai_max_tokens INT,
  ai_temperature NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.org_id,
    s.version,
    s.approved_reasons,
    s.high_value_comp_threshold,
    s.high_comp_pct_threshold,
    s.daily_comp_pct_warning,
    s.daily_comp_pct_critical,
    s.server_max_comp_amount,
    s.manager_min_for_high_value,
    s.manager_roles,
    s.ai_model,
    s.ai_max_tokens,
    s.ai_temperature
  FROM comp_settings s
  WHERE s.org_id = p_org_id
    AND s.is_active = TRUE
    AND s.effective_to IS NULL
  ORDER BY s.version DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_active_comp_settings IS 'Retrieves currently active comp settings for an organization';

-- ============================================================================
-- 6. SEED DEFAULT SETTINGS FOR EXISTING ORGANIZATIONS
-- ============================================================================

-- Insert default settings for all existing organizations
INSERT INTO comp_settings (org_id)
SELECT id FROM organizations
ON CONFLICT (org_id, version) DO NOTHING;

-- ============================================================================
-- 7. AUDIT LOGGING
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_comp_settings_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  -- Get current user from session
  v_user_id := NULLIF(current_setting('app.user_id', TRUE), '')::UUID;
  v_user_email := current_setting('app.user_email', TRUE);

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO settings_audit_log (
      table_name, record_id, field_name, old_value, new_value, user_id, user_email
    )
    SELECT
      TG_TABLE_NAME,
      NEW.org_id,
      key,
      to_jsonb(OLD) -> key,
      to_jsonb(NEW) -> key,
      v_user_id,
      v_user_email
    FROM jsonb_each(to_jsonb(NEW))
    WHERE to_jsonb(OLD) -> key IS DISTINCT FROM to_jsonb(NEW) -> key
      AND key NOT IN ('updated_at', 'created_at', 'version');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_comp_settings
  AFTER UPDATE ON comp_settings
  FOR EACH ROW EXECUTE FUNCTION audit_comp_settings_change();

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE comp_settings IS 'Organization-level comp policy settings with version control for audit trails';
COMMENT ON COLUMN comp_settings.approved_reasons IS 'JSONB array of approved comp reasons with optional metadata';
COMMENT ON COLUMN comp_settings.high_value_comp_threshold IS 'Dollar amount that triggers high-value comp review';
COMMENT ON COLUMN comp_settings.high_comp_pct_threshold IS 'Percentage of check that triggers high-comp-% review';
COMMENT ON COLUMN comp_settings.daily_comp_pct_warning IS 'Daily comp % that triggers warning alert';
COMMENT ON COLUMN comp_settings.daily_comp_pct_critical IS 'Daily comp % that triggers critical alert';
COMMENT ON COLUMN comp_settings.server_max_comp_amount IS 'Maximum comp amount server can approve without manager';
COMMENT ON COLUMN comp_settings.manager_min_for_high_value IS 'Minimum amount requiring manager-level authority';
COMMENT ON COLUMN comp_settings.manager_roles IS 'JSONB array of job titles considered managers';
COMMENT ON COLUMN comp_settings.ai_model IS 'Claude model ID for AI comp reviews';
COMMENT ON COLUMN comp_settings.ai_max_tokens IS 'Maximum tokens for AI response';
COMMENT ON COLUMN comp_settings.ai_temperature IS 'AI temperature setting (0.0-1.0)';
