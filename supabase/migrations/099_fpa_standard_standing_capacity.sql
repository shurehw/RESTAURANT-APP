-- FP&A-Standard Standing Bar Capacity Model
-- Deterministic, auditable, defensible for IC/partner reviews
--
-- Calculation chain:
-- bar_zone_gross_sf = total_gross_sf × bar_zone_pct
-- bar_zone_net_sf = bar_zone_gross_sf × bar_net_to_gross
-- standable_sf = bar_zone_net_sf × standable_pct
-- raw_standing_guests = standable_sf ÷ sf_per_standing_guest
-- effective_standing_guests = raw_standing_guests × utilization_factor
-- final_capacity = MIN(effective_standing_guests, code_cap)

-- ============================================================================
-- 1. ADD FP&A CALCULATION FIELDS TO PROFORMA_PROJECTS
-- ============================================================================

DO $$
BEGIN
  -- Bar zone sizing fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'bar_zone_pct'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN bar_zone_pct numeric(5,2) DEFAULT 15.00 CHECK (bar_zone_pct >= 0 AND bar_zone_pct <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'bar_net_to_gross'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN bar_net_to_gross numeric(4,2) DEFAULT 0.70 CHECK (bar_net_to_gross > 0 AND bar_net_to_gross <= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'standable_pct'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN standable_pct numeric(4,2) DEFAULT 0.60 CHECK (standable_pct >= 0 AND standable_pct <= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'sf_per_standing_guest'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN sf_per_standing_guest numeric(5,2) DEFAULT 8.00 CHECK (sf_per_standing_guest > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'utilization_factor'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN utilization_factor numeric(4,2) DEFAULT 0.85 CHECK (utilization_factor > 0 AND utilization_factor <= 1);
  END IF;

  -- Life safety / code fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'code_sf_per_person'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN code_sf_per_person numeric(5,2) DEFAULT 15.00 CHECK (code_sf_per_person > 0);
  END IF;

  -- Concept archetype (drives preset defaults)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'concept_archetype'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN concept_archetype text
      CHECK (concept_archetype IN ('dining_led', 'balanced_resto_bar', 'bar_forward', 'lounge_nightlife'));
  END IF;
END $$;

COMMENT ON COLUMN proforma_projects.bar_zone_pct IS
  'Bar zone as % of total gross SF. Presets: Dining-Led=10%, Balanced=15%, Bar-Forward=22%, Lounge=30%.';

COMMENT ON COLUMN proforma_projects.bar_net_to_gross IS
  'Net-to-gross ratio for bar zone (accounts for circulation, walls, BOH).
   Presets: Dining-Led=0.65, Balanced=0.70, Bar-Forward=0.72, Lounge=0.75.';

COMMENT ON COLUMN proforma_projects.standable_pct IS
  'Standable % of bar zone net SF (excludes bar structure, POS, storage).
   Presets: Dining-Led=50%, Balanced=60%, Bar-Forward=70%, Lounge=80%.';

COMMENT ON COLUMN proforma_projects.sf_per_standing_guest IS
  'SF per standing guest (density). Lower = more packed.
   Presets: Dining-Led=9.5, Balanced=8.0, Bar-Forward=7.0, Lounge=6.0.';

COMMENT ON COLUMN proforma_projects.utilization_factor IS
  'Peak utilization factor (realistic vs theoretical max).
   Presets: Dining-Led=0.80, Balanced=0.85, Bar-Forward=0.88, Lounge=0.90.';

COMMENT ON COLUMN proforma_projects.code_sf_per_person IS
  'Life-safety code SF per person (hard cap). Typical: 15 (unconcentrated), 7 (concentrated).
   Verify with local AHJ. Used to calculate code_cap = standable_sf ÷ code_sf_per_person.';

COMMENT ON COLUMN proforma_projects.concept_archetype IS
  'Concept archetype driving FP&A defaults: dining_led, balanced_resto_bar, bar_forward, lounge_nightlife.';

-- ============================================================================
-- 2. ADD DERIVED CAPACITY FIELDS TO PROFORMA_PROJECTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'bar_zone_gross_sf'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN bar_zone_gross_sf numeric(10,2) GENERATED ALWAYS AS (total_sf * bar_zone_pct / 100.0) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'bar_zone_net_sf'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN bar_zone_net_sf numeric(10,2)
      GENERATED ALWAYS AS (total_sf * bar_zone_pct / 100.0 * bar_net_to_gross) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'standable_sf'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN standable_sf numeric(10,2)
      GENERATED ALWAYS AS (total_sf * bar_zone_pct / 100.0 * bar_net_to_gross * standable_pct) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'raw_standing_guests'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN raw_standing_guests numeric(10,2)
      GENERATED ALWAYS AS (
        CASE
          WHEN sf_per_standing_guest > 0 THEN
            (total_sf * bar_zone_pct / 100.0 * bar_net_to_gross * standable_pct) / sf_per_standing_guest
          ELSE NULL
        END
      ) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'effective_standing_guests'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN effective_standing_guests numeric(10,2)
      GENERATED ALWAYS AS (
        CASE
          WHEN sf_per_standing_guest > 0 THEN
            (total_sf * bar_zone_pct / 100.0 * bar_net_to_gross * standable_pct) / sf_per_standing_guest * utilization_factor
          ELSE NULL
        END
      ) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'code_capacity_cap'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN code_capacity_cap numeric(10,2)
      GENERATED ALWAYS AS (
        CASE
          WHEN code_sf_per_person > 0 THEN
            (total_sf * bar_zone_pct / 100.0 * bar_net_to_gross * standable_pct) / code_sf_per_person
          ELSE NULL
        END
      ) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'standing_capacity_operational'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN standing_capacity_operational int
      GENERATED ALWAYS AS (
        floor(
          CASE
            WHEN sf_per_standing_guest > 0 THEN
              (total_sf * bar_zone_pct / 100.0 * bar_net_to_gross * standable_pct) / sf_per_standing_guest * utilization_factor
            ELSE NULL
          END
        )
      ) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'standing_capacity_final'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN standing_capacity_final int
      GENERATED ALWAYS AS (
        LEAST(
          floor(
            CASE
              WHEN sf_per_standing_guest > 0 THEN
                (total_sf * bar_zone_pct / 100.0 * bar_net_to_gross * standable_pct) / sf_per_standing_guest * utilization_factor
              ELSE NULL
            END
          ),
          floor(
            CASE
              WHEN code_sf_per_person > 0 THEN
                (total_sf * bar_zone_pct / 100.0 * bar_net_to_gross * standable_pct) / code_sf_per_person
              ELSE NULL
            END
          )
        )
      ) STORED;
  END IF;
END $$;

COMMENT ON COLUMN proforma_projects.bar_zone_gross_sf IS 'Calculated: total_sf × bar_zone_pct';
COMMENT ON COLUMN proforma_projects.bar_zone_net_sf IS 'Calculated: bar_zone_gross_sf × bar_net_to_gross';
COMMENT ON COLUMN proforma_projects.standable_sf IS 'Calculated: bar_zone_net_sf × standable_pct';
COMMENT ON COLUMN proforma_projects.raw_standing_guests IS 'Calculated: standable_sf ÷ sf_per_standing_guest';
COMMENT ON COLUMN proforma_projects.effective_standing_guests IS 'Calculated: raw_standing_guests × utilization_factor';
COMMENT ON COLUMN proforma_projects.code_capacity_cap IS 'Life-safety cap: standable_sf ÷ code_sf_per_person';
COMMENT ON COLUMN proforma_projects.standing_capacity_operational IS 'FP&A operational standing capacity (rounded down)';
COMMENT ON COLUMN proforma_projects.standing_capacity_final IS 'MIN(operational, code_cap) - final defensible number';

-- ============================================================================
-- 3. CREATE CONCEPT ARCHETYPE PRESET FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_concept_archetype_presets()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only apply if archetype is set and fields are null
  IF NEW.concept_archetype IS NOT NULL THEN

    CASE NEW.concept_archetype
      WHEN 'dining_led' THEN
        NEW.bar_zone_pct := COALESCE(NEW.bar_zone_pct, 10.00);
        NEW.bar_net_to_gross := COALESCE(NEW.bar_net_to_gross, 0.65);
        NEW.standable_pct := COALESCE(NEW.standable_pct, 0.50);
        NEW.sf_per_standing_guest := COALESCE(NEW.sf_per_standing_guest, 9.5);
        NEW.utilization_factor := COALESCE(NEW.utilization_factor, 0.80);

      WHEN 'balanced_resto_bar' THEN
        NEW.bar_zone_pct := COALESCE(NEW.bar_zone_pct, 15.00);
        NEW.bar_net_to_gross := COALESCE(NEW.bar_net_to_gross, 0.70);
        NEW.standable_pct := COALESCE(NEW.standable_pct, 0.60);
        NEW.sf_per_standing_guest := COALESCE(NEW.sf_per_standing_guest, 8.0);
        NEW.utilization_factor := COALESCE(NEW.utilization_factor, 0.85);

      WHEN 'bar_forward' THEN
        NEW.bar_zone_pct := COALESCE(NEW.bar_zone_pct, 22.00);
        NEW.bar_net_to_gross := COALESCE(NEW.bar_net_to_gross, 0.72);
        NEW.standable_pct := COALESCE(NEW.standable_pct, 0.70);
        NEW.sf_per_standing_guest := COALESCE(NEW.sf_per_standing_guest, 7.0);
        NEW.utilization_factor := COALESCE(NEW.utilization_factor, 0.88);

      WHEN 'lounge_nightlife' THEN
        NEW.bar_zone_pct := COALESCE(NEW.bar_zone_pct, 30.00);
        NEW.bar_net_to_gross := COALESCE(NEW.bar_net_to_gross, 0.75);
        NEW.standable_pct := COALESCE(NEW.standable_pct, 0.80);
        NEW.sf_per_standing_guest := COALESCE(NEW.sf_per_standing_guest, 6.0);
        NEW.utilization_factor := COALESCE(NEW.utilization_factor, 0.90);
    END CASE;

    -- Default code SF per person (unconcentrated standing)
    NEW.code_sf_per_person := COALESCE(NEW.code_sf_per_person, 15.00);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_concept_archetype_presets_trigger ON proforma_projects;
CREATE TRIGGER apply_concept_archetype_presets_trigger
  BEFORE INSERT OR UPDATE OF concept_archetype ON proforma_projects
  FOR EACH ROW
  EXECUTE FUNCTION apply_concept_archetype_presets();

COMMENT ON FUNCTION apply_concept_archetype_presets IS
  'Auto-applies FP&A-standard presets based on concept_archetype:
   - dining_led: 10% bar zone, 9.5 sf/guest, 0.80 utilization
   - balanced_resto_bar: 15% bar zone, 8.0 sf/guest, 0.85 utilization (DEFAULT)
   - bar_forward: 22% bar zone, 7.0 sf/guest, 0.88 utilization
   - lounge_nightlife: 30% bar zone, 6.0 sf/guest, 0.90 utilization';

-- ============================================================================
-- 4. OPERATIONAL REALITY CHECK FLAGS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_standing_capacity_warnings(p_project_id uuid)
RETURNS TABLE(
  warning_type text,
  severity text,
  message text,
  value numeric
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_standing_capacity int;
  v_bar_zone_pct numeric;
  v_sf_per_guest numeric;
  v_code_cap numeric;
  v_operational_cap numeric;
  v_concept_archetype text;
  v_bartenders_peak int;
BEGIN
  -- Get project data
  SELECT
    standing_capacity_final,
    bar_zone_pct,
    sf_per_standing_guest,
    code_capacity_cap,
    standing_capacity_operational,
    concept_archetype
  INTO
    v_standing_capacity,
    v_bar_zone_pct,
    v_sf_per_guest,
    v_code_cap,
    v_operational_cap,
    v_concept_archetype
  FROM proforma_projects
  WHERE id = p_project_id;

  -- Estimate peak bartenders (rough: 1 per 40 standing guests for bar-forward, 1 per 30 for lounge)
  v_bartenders_peak := GREATEST(1, CASE
    WHEN v_concept_archetype IN ('bar_forward', 'lounge_nightlife') THEN v_standing_capacity / 35
    ELSE v_standing_capacity / 50
  END);

  -- Warning 1: Service collapse risk (standing guests > 4× bartenders)
  IF v_standing_capacity > (v_bartenders_peak * 4) THEN
    RETURN QUERY SELECT
      'service_collapse_risk'::text,
      'critical'::text,
      format('Standing capacity (%s) exceeds 4× estimated peak bartenders (%s). Service collapse risk.',
        v_standing_capacity, v_bartenders_peak)::text,
      (v_standing_capacity::numeric / NULLIF(v_bartenders_peak, 0))::numeric;
  END IF;

  -- Warning 2: Vibe mismatch (low bar zone % but not dining-led)
  IF v_bar_zone_pct < 12 AND v_concept_archetype != 'dining_led' THEN
    RETURN QUERY SELECT
      'vibe_mismatch'::text,
      'warning'::text,
      format('Bar zone is only %s%% of space but concept is "%s". May not support bar-forward expectations.',
        v_bar_zone_pct, v_concept_archetype)::text,
      v_bar_zone_pct::numeric;
  END IF;

  -- Warning 3: Circulation failure (density too high for non-nightclub)
  IF v_sf_per_guest < 6 AND v_concept_archetype NOT IN ('lounge_nightlife') THEN
    RETURN QUERY SELECT
      'circulation_failure'::text,
      'critical'::text,
      format('Standing density (%s SF/guest) is nightclub-level but concept is "%s". Circulation will fail.',
        v_sf_per_guest, v_concept_archetype)::text,
      v_sf_per_guest::numeric;
  END IF;

  -- Warning 4: Code cap binding (operational exceeds code)
  IF v_operational_cap > v_code_cap THEN
    RETURN QUERY SELECT
      'code_cap_binding'::text,
      'critical'::text,
      format('Operational capacity (%s) exceeds life-safety code cap (%s). Design revision required.',
        floor(v_operational_cap), floor(v_code_cap))::text,
      (v_operational_cap - v_code_cap)::numeric;
  END IF;

  -- Warning 5: Clubby density alert (< 7 SF/guest)
  IF v_sf_per_guest < 7 THEN
    RETURN QUERY SELECT
      'clubby_density'::text,
      'info'::text,
      format('Standing density (%s SF/guest) is very tight. Expect nightclub/packed-bar experience.',
        v_sf_per_guest)::text,
      v_sf_per_guest::numeric;
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION get_standing_capacity_warnings IS
  'FP&A operational reality checks:
   - service_collapse_risk: standing > 4× bartenders
   - vibe_mismatch: low bar zone % but bar-forward concept
   - circulation_failure: nightclub density in non-nightclub
   - code_cap_binding: operational > life-safety limit (requires design change)
   - clubby_density: < 7 SF/guest (info/awareness)';

-- ============================================================================
-- 5. CREATE VIEW: FP&A STANDING CAPACITY SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW proforma_standing_capacity_summary AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  p.total_sf,
  p.concept_archetype,

  -- Inputs
  p.bar_zone_pct,
  p.bar_net_to_gross,
  p.standable_pct,
  p.sf_per_standing_guest,
  p.utilization_factor,
  p.code_sf_per_person,

  -- Calculation chain
  p.bar_zone_gross_sf,
  p.bar_zone_net_sf,
  p.standable_sf,
  p.raw_standing_guests,
  p.effective_standing_guests,

  -- Final numbers
  p.standing_capacity_operational,
  p.code_capacity_cap,
  p.standing_capacity_final,

  -- One-line multiplier (guests per gross SF)
  CASE
    WHEN p.total_sf > 0 THEN
      ROUND(p.standing_capacity_final::numeric / p.total_sf, 4)
    ELSE NULL
  END AS multiplier_guests_per_sf,

  -- Warning flags
  CASE
    WHEN p.standing_capacity_operational > p.code_capacity_cap THEN true
    ELSE false
  END AS code_cap_binding,

  CASE
    WHEN p.sf_per_standing_guest < 6 AND p.concept_archetype NOT IN ('lounge_nightlife') THEN true
    ELSE false
  END AS circulation_risk,

  CASE
    WHEN p.bar_zone_pct < 12 AND p.concept_archetype != 'dining_led' THEN true
    ELSE false
  END AS vibe_mismatch

FROM proforma_projects p
WHERE p.total_sf IS NOT NULL;

COMMENT ON VIEW proforma_standing_capacity_summary IS
  'FP&A-ready summary of standing capacity calculation chain with flags.
   Use for IC decks, partner reviews, and model auditing.';

-- ============================================================================
-- 6. REFERENCE: CONCEPT ARCHETYPE MULTIPLIERS
-- ============================================================================

COMMENT ON COLUMN proforma_projects.concept_archetype IS
  'Concept archetype driving FP&A defaults:

   ARCHETYPE          | MULTIPLIER (guests/SF) | Example 8k SF
   -------------------|------------------------|---------------
   dining_led         | 0.0022                 | ~18 standing
   balanced_resto_bar | 0.0067                 | ~54 standing (DEFAULT)
   bar_forward        | 0.0154                 | ~123 standing
   lounge_nightlife   | 0.0270                 | ~216 standing

   Multiplier = (bar_zone_pct × bar_net_to_gross × standable_pct × utilization_factor) ÷ sf_per_standing_guest

   If partner says "8k SF with 150 standing" → only bar_forward or lounge math supports this.';
