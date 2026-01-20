-- ============================================================================
-- P0: ENTERPRISE-GRADE SETTINGS VERSIONING & EFFECTIVE DATING
-- Implements immutable version rows for CFO auditability
-- ============================================================================

-- Temporarily disable audit trigger during migration (it expects 'id' column, we use org_id)
DROP TRIGGER IF EXISTS audit_proforma_settings ON proforma_settings;

-- ============================================================================
-- 1. ADD VERSIONING COLUMNS TO PROFORMA_SETTINGS
-- ============================================================================

-- Add versioning columns (without foreign key reference yet)
ALTER TABLE proforma_settings
ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS effective_to TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS superseded_by_org_id UUID,
ADD COLUMN IF NOT EXISTS superseded_by_version INT;

-- Drop existing primary key (CASCADE to remove dependent foreign keys)
ALTER TABLE proforma_settings DROP CONSTRAINT IF EXISTS proforma_settings_pkey CASCADE;

-- Create composite primary key with version
ALTER TABLE proforma_settings ADD PRIMARY KEY (org_id, version);

-- Now add the foreign key for superseded_by pointing to the new composite key
ALTER TABLE proforma_settings
  DROP CONSTRAINT IF EXISTS proforma_settings_superseded_by_fkey;

ALTER TABLE proforma_settings
  ADD CONSTRAINT proforma_settings_superseded_by_fkey
  FOREIGN KEY (superseded_by_org_id, superseded_by_version)
  REFERENCES proforma_settings(org_id, version)
  ON DELETE SET NULL;

-- Create index for active version queries (effective_to IS NULL = current version)
CREATE INDEX IF NOT EXISTS idx_proforma_settings_active
  ON proforma_settings(org_id, effective_from DESC)
  WHERE is_active = true AND effective_to IS NULL;

COMMENT ON COLUMN proforma_settings.version IS 'Immutable version number - increments on each change';
COMMENT ON COLUMN proforma_settings.effective_from IS 'When this version becomes active';
COMMENT ON COLUMN proforma_settings.effective_to IS 'When this version is superseded (NULL = current)';
COMMENT ON COLUMN proforma_settings.is_active IS 'Soft delete flag - allows historical reconstruction';
COMMENT ON COLUMN proforma_settings.superseded_by_org_id IS 'Org ID of next version (part of composite FK)';
COMMENT ON COLUMN proforma_settings.superseded_by_version IS 'Version number of next version (part of composite FK)';

-- ============================================================================
-- 2. VERSIONING FOR CONCEPT BENCHMARKS
-- ============================================================================

ALTER TABLE proforma_concept_benchmarks
ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- Update unique constraint to include version
ALTER TABLE proforma_concept_benchmarks DROP CONSTRAINT IF EXISTS proforma_concept_benchmarks_tenant_id_concept_type_market_tie_key;
ALTER TABLE proforma_concept_benchmarks
  ADD CONSTRAINT proforma_concept_benchmarks_unique_version
  UNIQUE(tenant_id, concept_type, market_tier, version, effective_date);

CREATE INDEX IF NOT EXISTS idx_concept_benchmarks_active_version
  ON proforma_concept_benchmarks(tenant_id, concept_type, market_tier, effective_date DESC)
  WHERE is_active = true;

-- ============================================================================
-- 3. VERSIONING FOR VALIDATION RULES
-- ============================================================================

ALTER TABLE proforma_validation_rules
ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS effective_to TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_validation_rules_active_version
  ON proforma_validation_rules(tenant_id, metric, effective_from DESC)
  WHERE is_active = true AND effective_to IS NULL;

-- ============================================================================
-- 4. VERSIONING FOR CITY WAGE PRESETS
-- ============================================================================

ALTER TABLE proforma_city_wage_presets
ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS effective_to TIMESTAMPTZ;

ALTER TABLE proforma_city_wage_presets DROP CONSTRAINT IF EXISTS proforma_city_wage_presets_tenant_id_city_name_state_code_key;
ALTER TABLE proforma_city_wage_presets
  ADD CONSTRAINT proforma_city_wage_presets_unique_version
  UNIQUE(tenant_id, city_name, state_code, version);

CREATE INDEX IF NOT EXISTS idx_city_presets_active_version
  ON proforma_city_wage_presets(tenant_id, city_name, state_code, effective_from DESC)
  WHERE is_active = true AND effective_to IS NULL;

-- ============================================================================
-- 5. VERSION-AWARE QUERY FUNCTION FOR PROFORMA_SETTINGS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_proforma_settings_at(
  p_org_id UUID,
  p_as_of TIMESTAMPTZ DEFAULT now()
) RETURNS TABLE (
  org_id UUID,
  version INT,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  market_tier_low_multiplier NUMERIC,
  market_tier_mid_multiplier NUMERIC,
  market_tier_high_multiplier NUMERIC,
  tipped_min_wage_floor_pct NUMERIC,
  default_min_wage_city NUMERIC,
  default_tip_credit NUMERIC,
  default_market_tier TEXT,
  default_density_benchmark TEXT,
  bar_lf_ratio NUMERIC,
  bar_min_lf NUMERIC,
  bar_max_lf NUMERIC,
  bar_inches_per_seat NUMERIC,
  bar_max_pct_of_dining NUMERIC,
  default_projection_years INT,
  default_sf_per_seat NUMERIC,
  default_dining_area_pct NUMERIC,
  default_boh_pct NUMERIC,
  default_food_cogs_pct NUMERIC,
  default_bev_cogs_pct NUMERIC,
  default_other_cogs_pct NUMERIC,
  default_foh_hours_per_100_covers NUMERIC,
  default_boh_hours_per_100_covers NUMERIC,
  default_foh_hourly_rate NUMERIC,
  default_boh_hourly_rate NUMERIC,
  default_payroll_burden_pct NUMERIC,
  default_linen_pct NUMERIC,
  default_smallwares_pct NUMERIC,
  default_cleaning_pct NUMERIC,
  default_cc_fees_pct NUMERIC,
  default_marketing_pct NUMERIC,
  default_gna_pct NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.org_id,
    s.version,
    s.effective_from,
    s.effective_to,
    s.market_tier_low_multiplier,
    s.market_tier_mid_multiplier,
    s.market_tier_high_multiplier,
    s.tipped_min_wage_floor_pct,
    s.default_min_wage_city,
    s.default_tip_credit,
    s.default_market_tier,
    s.default_density_benchmark,
    s.bar_lf_ratio,
    s.bar_min_lf,
    s.bar_max_lf,
    s.bar_inches_per_seat,
    s.bar_max_pct_of_dining,
    s.default_projection_years,
    s.default_sf_per_seat,
    s.default_dining_area_pct,
    s.default_boh_pct,
    s.default_food_cogs_pct,
    s.default_bev_cogs_pct,
    s.default_other_cogs_pct,
    s.default_foh_hours_per_100_covers,
    s.default_boh_hours_per_100_covers,
    s.default_foh_hourly_rate,
    s.default_boh_hourly_rate,
    s.default_payroll_burden_pct,
    s.default_linen_pct,
    s.default_smallwares_pct,
    s.default_cleaning_pct,
    s.default_cc_fees_pct,
    s.default_marketing_pct,
    s.default_gna_pct
  FROM proforma_settings s
  WHERE s.org_id = p_org_id
    AND s.is_active = true
    AND s.effective_from <= p_as_of
    AND (s.effective_to IS NULL OR s.effective_to > p_as_of)
  ORDER BY s.effective_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_proforma_settings_at IS 'CFO-grade: retrieves settings version active at a specific point in time for historical reconstruction';

-- ============================================================================
-- 6. UPDATE CONCEPT BENCHMARKS FUNCTION TO BE VERSION-AWARE
-- ============================================================================

DROP FUNCTION IF EXISTS get_concept_benchmarks(text, text, uuid);

CREATE OR REPLACE FUNCTION get_concept_benchmarks_at(
  p_concept_type TEXT,
  p_market_tier TEXT DEFAULT 'MID',
  p_tenant_id UUID DEFAULT NULL,
  p_as_of DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  sf_per_seat_min NUMERIC,
  sf_per_seat_max NUMERIC,
  seats_per_1k_sf_min NUMERIC,
  seats_per_1k_sf_max NUMERIC,
  dining_area_pct_min NUMERIC,
  dining_area_pct_max NUMERIC,
  kitchen_boh_pct_min NUMERIC,
  kitchen_boh_pct_max NUMERIC,
  storage_office_pct_min NUMERIC,
  storage_office_pct_max NUMERIC,
  guest_facing_pct_min NUMERIC,
  guest_facing_pct_max NUMERIC,
  version INT,
  effective_date DATE,
  is_global BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.sf_per_seat_min,
    b.sf_per_seat_max,
    b.seats_per_1k_sf_min,
    b.seats_per_1k_sf_max,
    b.dining_area_pct_min,
    b.dining_area_pct_max,
    b.kitchen_boh_pct_min,
    b.kitchen_boh_pct_max,
    b.storage_office_pct_min,
    b.storage_office_pct_max,
    b.guest_facing_pct_min,
    b.guest_facing_pct_max,
    b.version,
    b.effective_date,
    (b.tenant_id IS NULL) as is_global
  FROM proforma_concept_benchmarks b
  WHERE b.concept_type = p_concept_type
    AND b.market_tier = p_market_tier
    AND b.is_active = true
    AND (b.tenant_id = p_tenant_id OR b.tenant_id IS NULL)
    AND b.effective_date <= p_as_of
  ORDER BY
    b.tenant_id NULLS LAST,  -- Prefer tenant-specific over global
    b.effective_date DESC,   -- Most recent effective
    b.version DESC           -- Highest version
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_concept_benchmarks_at IS 'Version-aware: retrieves benchmarks active at specific date with tenant precedence';

-- ============================================================================
-- 7. TRIGGER TO ENFORCE IMMUTABILITY (INSERT NEW VERSION ON UPDATE)
-- ============================================================================

CREATE OR REPLACE FUNCTION proforma_settings_version_on_update()
RETURNS TRIGGER AS $$
DECLARE
  v_next_version INT;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_next_version
  FROM proforma_settings
  WHERE org_id = NEW.org_id;

  -- Mark current version as superseded
  UPDATE proforma_settings
  SET effective_to = now(),
      superseded_by_org_id = NEW.org_id,
      superseded_by_version = v_next_version
  WHERE org_id = OLD.org_id
    AND version = OLD.version
    AND effective_to IS NULL;

  -- Insert new version row instead of updating
  INSERT INTO proforma_settings (
    org_id, version, effective_from, effective_to, is_active, created_by,
    market_tier_low_multiplier, market_tier_mid_multiplier, market_tier_high_multiplier,
    tipped_min_wage_floor_pct, default_min_wage_city, default_tip_credit, default_market_tier,
    default_density_benchmark, bar_lf_ratio, bar_min_lf, bar_max_lf, bar_inches_per_seat,
    bar_max_pct_of_dining, default_projection_years, default_sf_per_seat, default_dining_area_pct,
    default_boh_pct, default_food_cogs_pct, default_bev_cogs_pct, default_other_cogs_pct,
    default_foh_hours_per_100_covers, default_boh_hours_per_100_covers,
    default_foh_hourly_rate, default_boh_hourly_rate, default_payroll_burden_pct,
    default_linen_pct, default_smallwares_pct, default_cleaning_pct,
    default_cc_fees_pct, default_marketing_pct, default_gna_pct,
    created_at, updated_at
  ) VALUES (
    NEW.org_id, v_next_version, now(), NULL, true, NEW.created_by,
    NEW.market_tier_low_multiplier, NEW.market_tier_mid_multiplier, NEW.market_tier_high_multiplier,
    NEW.tipped_min_wage_floor_pct, NEW.default_min_wage_city, NEW.default_tip_credit, NEW.default_market_tier,
    NEW.default_density_benchmark, NEW.bar_lf_ratio, NEW.bar_min_lf, NEW.bar_max_lf, NEW.bar_inches_per_seat,
    NEW.bar_max_pct_of_dining, NEW.default_projection_years, NEW.default_sf_per_seat, NEW.default_dining_area_pct,
    NEW.default_boh_pct, NEW.default_food_cogs_pct, NEW.default_bev_cogs_pct, NEW.default_other_cogs_pct,
    NEW.default_foh_hours_per_100_covers, NEW.default_boh_hours_per_100_covers,
    NEW.default_foh_hourly_rate, NEW.default_boh_hourly_rate, NEW.default_payroll_burden_pct,
    NEW.default_linen_pct, NEW.default_smallwares_pct, NEW.default_cleaning_pct,
    NEW.default_cc_fees_pct, NEW.default_marketing_pct, NEW.default_gna_pct,
    now(), now()
  );

  -- Prevent the original UPDATE from happening
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger (disabled for now - will enable after testing)
-- CREATE TRIGGER proforma_settings_version_trigger
--   BEFORE UPDATE ON proforma_settings
--   FOR EACH ROW
--   WHEN (OLD.version IS NOT NULL)
--   EXECUTE FUNCTION proforma_settings_version_on_update();

COMMENT ON FUNCTION proforma_settings_version_on_update IS 'Enforces immutable versioning: UPDATEs create new version rows instead of modifying in place';

-- ============================================================================
-- 8. HELPER FUNCTION: CHECK IF ROW IS GLOBAL (IMMUTABLE)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_global_immutable(
  p_table_name TEXT,
  p_record_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_is_global BOOLEAN;
BEGIN
  EXECUTE format(
    'SELECT (tenant_id IS NULL) FROM %I WHERE id = $1',
    p_table_name
  ) INTO v_is_global USING p_record_id;

  RETURN COALESCE(v_is_global, false);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_global_immutable IS 'Returns true if row has tenant_id IS NULL (global/immutable)';

-- ============================================================================
-- 9. SEED INITIAL VERSION FOR EXISTING ROWS
-- ============================================================================

-- Update existing rows to have version = 1 if not already set
DO $$
DECLARE
  v_settings_count INT;
  v_benchmarks_count INT;
  v_rules_count INT;
  v_presets_count INT;
BEGIN
  -- Set version = 1 for existing rows that don't have it
  UPDATE proforma_settings
  SET version = COALESCE(version, 1),
      effective_from = COALESCE(effective_from, created_at, now()),
      is_active = COALESCE(is_active, true);
  GET DIAGNOSTICS v_settings_count = ROW_COUNT;

  UPDATE proforma_concept_benchmarks
  SET version = COALESCE(version, 1);
  GET DIAGNOSTICS v_benchmarks_count = ROW_COUNT;

  UPDATE proforma_validation_rules
  SET version = COALESCE(version, 1),
      effective_from = COALESCE(effective_from, created_at, now());
  GET DIAGNOSTICS v_rules_count = ROW_COUNT;

  UPDATE proforma_city_wage_presets
  SET version = COALESCE(version, 1),
      effective_from = COALESCE(effective_from, created_at, now());
  GET DIAGNOSTICS v_presets_count = ROW_COUNT;

  RAISE NOTICE 'Version seeding complete: settings=%, benchmarks=%, rules=%, presets=%',
    v_settings_count, v_benchmarks_count, v_rules_count, v_presets_count;
END $$;

-- ============================================================================
-- 10. RECREATE AUDIT TRIGGER FOR COMPOSITE KEY
-- ============================================================================

-- Fix the audit trigger to work with proforma_settings' composite key (org_id, version)
CREATE OR REPLACE FUNCTION audit_proforma_settings_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
BEGIN
  -- Get current user from session (set by application)
  v_user_id := current_setting('app.user_id', true)::uuid;
  v_user_email := current_setting('app.user_email', true);

  -- Log each changed field
  IF TG_OP = 'UPDATE' THEN
    -- For proforma_settings, use org_id as record_id (primary key part)
    INSERT INTO settings_audit_log (
      table_name, record_id, field_name, old_value, new_value, user_id, user_email
    )
    SELECT
      TG_TABLE_NAME,
      NEW.org_id,  -- Use org_id instead of id
      key,
      to_jsonb(OLD) -> key,
      to_jsonb(NEW) -> key,
      v_user_id,
      v_user_email
    FROM jsonb_each(to_jsonb(NEW))
    WHERE to_jsonb(OLD) -> key IS DISTINCT FROM to_jsonb(NEW) -> key
      AND key NOT IN ('updated_at', 'created_at', 'version'); -- Exclude version since it's part of PK
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger with fixed function
CREATE TRIGGER audit_proforma_settings
  AFTER UPDATE ON proforma_settings
  FOR EACH ROW EXECUTE FUNCTION audit_proforma_settings_change();

COMMENT ON FUNCTION audit_proforma_settings_change IS 'Audit trigger for proforma_settings - handles composite key (org_id, version)';
