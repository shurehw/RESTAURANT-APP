-- ============================================================================
-- CONCEPT BENCHMARKS: Move seating/density benchmarks to database
-- Eliminates hardcoded SEATING_BENCHMARKS constant
-- ============================================================================

CREATE TABLE IF NOT EXISTS proforma_concept_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  concept_type text NOT NULL,
  market_tier text DEFAULT 'MID' CHECK (market_tier IN ('LOW', 'MID', 'HIGH')),

  -- Seating density benchmarks
  sf_per_seat_min numeric(5,2) NOT NULL,
  sf_per_seat_max numeric(5,2) NOT NULL,
  seats_per_1k_sf_min numeric(5,2) NOT NULL,
  seats_per_1k_sf_max numeric(5,2) NOT NULL,
  dining_area_pct_min numeric(5,2) NOT NULL,
  dining_area_pct_max numeric(5,2) NOT NULL,

  -- BOH allocation (concept-specific)
  kitchen_boh_pct_min numeric(5,2) DEFAULT 25,
  kitchen_boh_pct_max numeric(5,2) DEFAULT 35,
  storage_office_pct_min numeric(5,2) DEFAULT 5,
  storage_office_pct_max numeric(5,2) DEFAULT 10,
  guest_facing_pct_min numeric(5,2) DEFAULT 60,
  guest_facing_pct_max numeric(5,2) DEFAULT 70,

  -- Metadata
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, concept_type, market_tier, effective_date)
);

CREATE INDEX idx_concept_benchmarks_tenant ON proforma_concept_benchmarks(tenant_id);
CREATE INDEX idx_concept_benchmarks_concept ON proforma_concept_benchmarks(concept_type);
CREATE INDEX idx_concept_benchmarks_active ON proforma_concept_benchmarks(is_active) WHERE is_active = true;

COMMENT ON TABLE proforma_concept_benchmarks IS 'Industry benchmarks for seating density and space allocation by concept type';
COMMENT ON COLUMN proforma_concept_benchmarks.sf_per_seat_min IS 'Minimum square feet per seat for this concept';
COMMENT ON COLUMN proforma_concept_benchmarks.dining_area_pct_min IS 'Minimum % of total space allocated to dining area';
COMMENT ON COLUMN proforma_concept_benchmarks.market_tier IS 'Optional market tier for regional variance (e.g., NYC HIGH vs rural MID)';

-- ============================================================================
-- SEED INDUSTRY STANDARD BENCHMARKS
-- Migrated from lib/proforma/constants.ts SEATING_BENCHMARKS
-- ============================================================================

INSERT INTO proforma_concept_benchmarks (
  tenant_id, concept_type, market_tier,
  sf_per_seat_min, sf_per_seat_max,
  seats_per_1k_sf_min, seats_per_1k_sf_max,
  dining_area_pct_min, dining_area_pct_max,
  kitchen_boh_pct_min, kitchen_boh_pct_max,
  storage_office_pct_min, storage_office_pct_max,
  guest_facing_pct_min, guest_facing_pct_max
) VALUES
  -- Fast Casual / QSR
  (NULL, 'fast-casual', 'MID', 12, 18, 55, 85, 55, 65, 20, 30, 5, 10, 60, 70),

  -- Casual Dining
  (NULL, 'casual-dining', 'MID', 18, 22, 45, 55, 60, 70, 25, 35, 5, 10, 60, 70),

  -- Premium Casual / Full Service
  (NULL, 'premium-casual', 'MID', 22, 26, 38, 45, 65, 75, 25, 35, 5, 10, 60, 70),

  -- Fine Dining
  (NULL, 'fine-dining', 'MID', 28, 40, 25, 35, 70, 80, 30, 40, 5, 10, 55, 65),

  -- Bar / Cocktail Lounge
  (NULL, 'bar-lounge', 'MID', 14, 20, 50, 70, 50, 65, 15, 25, 5, 10, 65, 75),

  -- Nightclub / Standing
  (NULL, 'nightclub', 'MID', 7, 10, 100, 140, 60, 80, 10, 20, 5, 10, 70, 85)
ON CONFLICT (tenant_id, concept_type, market_tier, effective_date) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTION: Get active benchmarks for concept
-- ============================================================================

CREATE OR REPLACE FUNCTION get_concept_benchmarks(
  p_concept_type text,
  p_market_tier text DEFAULT 'MID',
  p_tenant_id uuid DEFAULT NULL
) RETURNS TABLE (
  sf_per_seat_min numeric,
  sf_per_seat_max numeric,
  seats_per_1k_sf_min numeric,
  seats_per_1k_sf_max numeric,
  dining_area_pct_min numeric,
  dining_area_pct_max numeric,
  kitchen_boh_pct_min numeric,
  kitchen_boh_pct_max numeric,
  storage_office_pct_min numeric,
  storage_office_pct_max numeric,
  guest_facing_pct_min numeric,
  guest_facing_pct_max numeric
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
    b.guest_facing_pct_max
  FROM proforma_concept_benchmarks b
  WHERE b.concept_type = p_concept_type
    AND b.market_tier = p_market_tier
    AND b.is_active = true
    AND (b.tenant_id = p_tenant_id OR b.tenant_id IS NULL)
    AND b.effective_date <= CURRENT_DATE
  ORDER BY
    b.tenant_id NULLS LAST,  -- Prefer tenant-specific over global
    b.effective_date DESC     -- Most recent
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_concept_benchmarks IS 'Retrieves active benchmarks for concept type, preferring tenant-specific over global defaults';

-- ============================================================================
-- VALIDATION RULES TABLE (P1)
-- Move hardcoded validation thresholds to database
-- ============================================================================

CREATE TABLE IF NOT EXISTS proforma_validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,

  -- Rule identification
  metric text NOT NULL, -- 'sf_per_seat', 'boh_pct', 'rent_per_seat_month', etc.
  concept_type text,    -- NULL = applies to all concepts
  market_tier text,     -- NULL = applies to all tiers
  operator_tier text,   -- 'novice', 'experienced', 'institutional' (future use)

  -- Threshold values
  min_value numeric(10,2),
  max_value numeric(10,2),

  -- Severity
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error')),

  -- Message template
  message_template text NOT NULL,

  -- Metadata
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_validation_rules_tenant ON proforma_validation_rules(tenant_id);
CREATE INDEX idx_validation_rules_metric ON proforma_validation_rules(metric);
CREATE INDEX idx_validation_rules_concept ON proforma_validation_rules(concept_type);
CREATE INDEX idx_validation_rules_active ON proforma_validation_rules(is_active) WHERE is_active = true;

COMMENT ON TABLE proforma_validation_rules IS 'Configurable validation rules for proforma models - eliminates hardcoded thresholds';
COMMENT ON COLUMN proforma_validation_rules.operator_tier IS 'Future: different risk tolerances for novice vs institutional operators';
COMMENT ON COLUMN proforma_validation_rules.message_template IS 'Supports {value}, {min}, {max}, {concept} placeholders';

-- Seed validation rules from constants.ts
INSERT INTO proforma_validation_rules (
  tenant_id, metric, concept_type, min_value, max_value, severity, message_template
) VALUES
  -- SF per seat validations
  (NULL, 'sf_per_seat', 'casual-dining', 18, 26, 'warning', 'Full service typically requires {min}-{max} SF/seat. Current: {value}'),
  (NULL, 'sf_per_seat', 'premium-casual', 18, 26, 'warning', 'Full service typically requires {min}-{max} SF/seat. Current: {value}'),
  (NULL, 'sf_per_seat', 'fine-dining', 28, NULL, 'error', 'Fine dining requires minimum {min} SF/seat. Current: {value}'),
  (NULL, 'sf_per_seat', 'fast-casual', NULL, 18, 'warning', 'Fast casual typically uses ≤{max} SF/seat. Current: {value}'),

  -- BOH allocation
  (NULL, 'boh_pct', NULL, 25, NULL, 'error', 'BOH allocation below minimum ({min}%). Current: {value}%'),

  -- Rent per seat
  (NULL, 'rent_per_seat_month', NULL, NULL, 250, 'warning', 'HIGH RISK: Rent/seat/month exceeds ${max}. Current: ${value}')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SETTINGS AUDIT LOG TABLE (P1)
-- Track all changes to settings for SOX compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What changed
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  field_name text NOT NULL,

  -- Values
  old_value jsonb,
  new_value jsonb,

  -- Who/when
  user_id uuid NOT NULL,
  user_email text,
  changed_at timestamptz NOT NULL DEFAULT now(),

  -- Context
  ip_address inet,
  user_agent text,
  change_reason text
);

CREATE INDEX idx_audit_log_table ON settings_audit_log(table_name);
CREATE INDEX idx_audit_log_record ON settings_audit_log(record_id);
CREATE INDEX idx_audit_log_user ON settings_audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON settings_audit_log(changed_at DESC);

COMMENT ON TABLE settings_audit_log IS 'SOX-compliant audit trail for all settings changes';

-- ============================================================================
-- AUDIT TRIGGER FUNCTION
-- Automatically log changes to critical tables
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_settings_change() RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
BEGIN
  -- Get current user from session (set by application)
  v_user_id := current_setting('app.user_id', true)::uuid;
  v_user_email := current_setting('app.user_email', true);

  -- Log each changed field
  IF TG_OP = 'UPDATE' THEN
    -- Compare OLD and NEW, log differences
    INSERT INTO settings_audit_log (
      table_name, record_id, field_name, old_value, new_value, user_id, user_email
    )
    SELECT
      TG_TABLE_NAME,
      NEW.id,
      key,
      to_jsonb(OLD) -> key,
      to_jsonb(NEW) -> key,
      v_user_id,
      v_user_email
    FROM jsonb_each(to_jsonb(NEW))
    WHERE to_jsonb(OLD) -> key IS DISTINCT FROM to_jsonb(NEW) -> key
      AND key NOT IN ('updated_at', 'created_at'); -- Exclude timestamp fields
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to critical tables
CREATE TRIGGER audit_proforma_settings
  AFTER UPDATE ON proforma_settings
  FOR EACH ROW EXECUTE FUNCTION audit_settings_change();

CREATE TRIGGER audit_concept_benchmarks
  AFTER UPDATE ON proforma_concept_benchmarks
  FOR EACH ROW EXECUTE FUNCTION audit_settings_change();

CREATE TRIGGER audit_validation_rules
  AFTER UPDATE ON proforma_validation_rules
  FOR EACH ROW EXECUTE FUNCTION audit_settings_change();

CREATE TRIGGER audit_city_wage_presets
  AFTER UPDATE ON proforma_city_wage_presets
  FOR EACH ROW EXECUTE FUNCTION audit_settings_change();
