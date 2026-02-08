-- ══════════════════════════════════════════════════════════════════════════
-- OPERATIONAL STANDARDS SCHEMA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Unified enforcement standards for comp, labor, and revenue management
--
-- ENFORCEMENT PRINCIPLE:
-- Companies calibrate sensitivity, not accountability.
-- OpsOS defines what must be reviewed.
--
-- Layer 1: Fixed rails (hardcoded, non-negotiable)
-- Layer 2: Company calibration (bounded by OpsOS ranges)
-- Layer 3: Venue targets (derived, not authored)
--
-- INVARIANT RULES:
-- - Targets are configurable
-- - Bounds are not
-- - Exceptions always fire
-- - Patterns escalate
-- - History is immutable
--
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. OPERATIONAL STANDARDS TABLE ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS operational_standards (
    -- Primary key
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (org_id, version),

    -- Comp standards (existing structure from comp_settings)
    comp_approved_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    comp_high_value_threshold DECIMAL(10,2) NOT NULL DEFAULT 200,
    comp_high_pct_threshold DECIMAL(5,2) NOT NULL DEFAULT 50,
    comp_daily_pct_warning DECIMAL(5,2) NOT NULL DEFAULT 2,
    comp_daily_pct_critical DECIMAL(5,2) NOT NULL DEFAULT 3,
    comp_server_max_amount DECIMAL(10,2) NOT NULL DEFAULT 50,
    comp_manager_min_high_value DECIMAL(10,2) NOT NULL DEFAULT 200,
    comp_manager_roles TEXT[] NOT NULL DEFAULT ARRAY['Manager', 'General Manager', 'Assistant Manager', 'AGM', 'GM'],
    comp_ai_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
    comp_ai_max_tokens INTEGER NOT NULL DEFAULT 4000,
    comp_ai_temperature DECIMAL(3,2) NOT NULL DEFAULT 0.3,

    -- Labor standards (NEW - Integrated v1.0)
    labor_target_pct DECIMAL(5,2) NOT NULL DEFAULT 22,              -- Target labor % (OpsOS bounds: 18-28%)
    labor_pct_tolerance DECIMAL(5,2) NOT NULL DEFAULT 1.5,          -- Tolerance ±% (OpsOS bounds: 1.5-2.0%)
    labor_splh_floor DECIMAL(10,2) NOT NULL DEFAULT 75,             -- SPLH floor (OpsOS bounds: $55-120)
    labor_cplh_target DECIMAL(5,2) NOT NULL DEFAULT 3.0,            -- CPLH target (OpsOS bounds: 2.0-6.0)
    labor_cplh_tolerance DECIMAL(5,2) NOT NULL DEFAULT 0.4,         -- CPLH tolerance
    labor_ot_warning_threshold DECIMAL(5,2) NOT NULL DEFAULT 8,     -- OT warning % of total hours
    labor_ot_critical_threshold DECIMAL(5,2) NOT NULL DEFAULT 12,   -- OT critical % of total hours
    labor_excluded_roles TEXT[] NOT NULL DEFAULT ARRAY['Owner', 'Executive', 'Regional Manager', 'Corporate'],

    -- Revenue standards (placeholder for future implementation)
    revenue_avg_cover_floor DECIMAL(10,2),
    revenue_avg_cover_ceiling DECIMAL(10,2),
    revenue_bev_mix_target DECIMAL(5,2),
    revenue_bev_mix_tolerance DECIMAL(5,2),
    revenue_promo_tags TEXT[],
    revenue_cover_drop_warning DECIMAL(5,2),
    revenue_cover_drop_critical DECIMAL(5,2),

    -- Version control & metadata
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    superseded_by_org_id UUID REFERENCES organizations(id),
    superseded_by_version INTEGER,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT version_positive CHECK (version > 0),
    CONSTRAINT one_active_per_org CHECK (
        (is_active = true AND effective_to IS NULL) OR
        (is_active = false AND effective_to IS NOT NULL)
    ),

    -- Labor bounds validation (Layer 1: LOCKED)
    CONSTRAINT labor_target_pct_bounds CHECK (labor_target_pct BETWEEN 18 AND 28),
    CONSTRAINT labor_tolerance_bounds CHECK (labor_pct_tolerance BETWEEN 1.5 AND 2.0),
    CONSTRAINT splh_bounds CHECK (labor_splh_floor BETWEEN 55 AND 120),
    CONSTRAINT cplh_bounds CHECK (labor_cplh_target BETWEEN 2.0 AND 6.0),
    CONSTRAINT ot_thresholds_valid CHECK (labor_ot_warning_threshold < labor_ot_critical_threshold)
);

-- Indexes
CREATE INDEX idx_operational_standards_org_active ON operational_standards(org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_operational_standards_effective ON operational_standards(org_id, effective_from, effective_to);
CREATE INDEX idx_operational_standards_superseded ON operational_standards(superseded_by_org_id, superseded_by_version);

-- ── 2. RLS POLICIES ─────────────────────────────────────────────────────────

ALTER TABLE operational_standards ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by API)
CREATE POLICY "Service role has full access to operational_standards"
    ON operational_standards
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can view their org's standards
CREATE POLICY "Users can view their organization's operational standards"
    ON operational_standards
    FOR SELECT
    TO authenticated
    USING (
        org_id IN (
            SELECT organization_id FROM organization_users
            WHERE user_id = auth.uid()
            AND is_active = TRUE
        )
    );

-- Only org admins can update standards
CREATE POLICY "Org admins can manage operational standards"
    ON operational_standards
    FOR ALL
    TO authenticated
    USING (
        org_id IN (
            SELECT organization_id FROM organization_users
            WHERE user_id = auth.uid()
            AND is_active = TRUE
            AND role IN ('admin', 'owner')
        )
    )
    WITH CHECK (
        org_id IN (
            SELECT organization_id FROM organization_users
            WHERE user_id = auth.uid()
            AND is_active = TRUE
            AND role IN ('admin', 'owner')
        )
    );

-- ── 3. HELPER FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Get active operational standards for an organization
 */
CREATE OR REPLACE FUNCTION get_active_operational_standards(p_org_id UUID)
RETURNS TABLE (
    org_id UUID,
    version INTEGER,
    -- Comp fields
    comp_approved_reasons JSONB,
    comp_high_value_threshold DECIMAL,
    comp_high_pct_threshold DECIMAL,
    comp_daily_pct_warning DECIMAL,
    comp_daily_pct_critical DECIMAL,
    comp_server_max_amount DECIMAL,
    comp_manager_min_high_value DECIMAL,
    comp_manager_roles TEXT[],
    comp_ai_model TEXT,
    comp_ai_max_tokens INTEGER,
    comp_ai_temperature DECIMAL,
    -- Labor fields
    labor_target_pct DECIMAL,
    labor_pct_tolerance DECIMAL,
    labor_splh_floor DECIMAL,
    labor_cplh_target DECIMAL,
    labor_cplh_tolerance DECIMAL,
    labor_ot_warning_threshold DECIMAL,
    labor_ot_critical_threshold DECIMAL,
    labor_excluded_roles TEXT[],
    -- Metadata
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        org_id,
        version,
        comp_approved_reasons,
        comp_high_value_threshold,
        comp_high_pct_threshold,
        comp_daily_pct_warning,
        comp_daily_pct_critical,
        comp_server_max_amount,
        comp_manager_min_high_value,
        comp_manager_roles,
        comp_ai_model,
        comp_ai_max_tokens,
        comp_ai_temperature,
        labor_target_pct,
        labor_pct_tolerance,
        labor_splh_floor,
        labor_cplh_target,
        labor_cplh_tolerance,
        labor_ot_warning_threshold,
        labor_ot_critical_threshold,
        labor_excluded_roles,
        effective_from,
        effective_to
    FROM operational_standards
    WHERE operational_standards.org_id = p_org_id
    AND is_active = true
    AND effective_from <= NOW()
    AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
$$;

/**
 * Get operational standards as of a specific date (for historical queries)
 */
CREATE OR REPLACE FUNCTION get_operational_standards_at(p_org_id UUID, p_as_of TIMESTAMPTZ)
RETURNS TABLE (
    org_id UUID,
    version INTEGER,
    comp_approved_reasons JSONB,
    comp_high_value_threshold DECIMAL,
    comp_high_pct_threshold DECIMAL,
    comp_daily_pct_warning DECIMAL,
    comp_daily_pct_critical DECIMAL,
    comp_server_max_amount DECIMAL,
    comp_manager_min_high_value DECIMAL,
    comp_manager_roles TEXT[],
    comp_ai_model TEXT,
    comp_ai_max_tokens INTEGER,
    comp_ai_temperature DECIMAL,
    labor_target_pct DECIMAL,
    labor_pct_tolerance DECIMAL,
    labor_splh_floor DECIMAL,
    labor_cplh_target DECIMAL,
    labor_cplh_tolerance DECIMAL,
    labor_ot_warning_threshold DECIMAL,
    labor_ot_critical_threshold DECIMAL,
    labor_excluded_roles TEXT[],
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        org_id,
        version,
        comp_approved_reasons,
        comp_high_value_threshold,
        comp_high_pct_threshold,
        comp_daily_pct_warning,
        comp_daily_pct_critical,
        comp_server_max_amount,
        comp_manager_min_high_value,
        comp_manager_roles,
        comp_ai_model,
        comp_ai_max_tokens,
        comp_ai_temperature,
        labor_target_pct,
        labor_pct_tolerance,
        labor_splh_floor,
        labor_cplh_target,
        labor_cplh_tolerance,
        labor_ot_warning_threshold,
        labor_ot_critical_threshold,
        labor_excluded_roles,
        effective_from,
        effective_to
    FROM operational_standards
    WHERE operational_standards.org_id = p_org_id
    AND effective_from <= p_as_of
    AND (effective_to IS NULL OR effective_to > p_as_of)
    ORDER BY effective_from DESC
    LIMIT 1;
$$;

-- ── 4. AUDIT LOGGING ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS operational_standards_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    version INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'superseded', 'activated', 'deactivated')),
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changes JSONB,
    FOREIGN KEY (org_id, version) REFERENCES operational_standards(org_id, version)
);

CREATE INDEX idx_op_standards_audit_org ON operational_standards_audit(org_id, changed_at DESC);

-- Audit trigger
CREATE OR REPLACE FUNCTION audit_operational_standards_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO operational_standards_audit (org_id, version, action, changed_by, changes)
        VALUES (NEW.org_id, NEW.version, 'created', NEW.created_by, row_to_json(NEW)::jsonb);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_active = true AND NEW.is_active = false THEN
            INSERT INTO operational_standards_audit (org_id, version, action, changed_by, changes)
            VALUES (NEW.org_id, NEW.version, 'superseded', NEW.created_by,
                jsonb_build_object(
                    'superseded_by_org_id', NEW.superseded_by_org_id,
                    'superseded_by_version', NEW.superseded_by_version
                )
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER audit_operational_standards
    AFTER INSERT OR UPDATE ON operational_standards
    FOR EACH ROW
    EXECUTE FUNCTION audit_operational_standards_changes();

-- ── 5. MIGRATION FROM EXISTING COMP_SETTINGS ───────────────────────────────

-- Migrate existing comp_settings to operational_standards (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'comp_settings') THEN
        INSERT INTO operational_standards (
            org_id,
            version,
            comp_approved_reasons,
            comp_high_value_threshold,
            comp_high_pct_threshold,
            comp_daily_pct_warning,
            comp_daily_pct_critical,
            comp_server_max_amount,
            comp_manager_min_high_value,
            comp_manager_roles,
            comp_ai_model,
            comp_ai_max_tokens,
            comp_ai_temperature,
            effective_from,
            effective_to,
            is_active,
            superseded_by_org_id,
            superseded_by_version,
            created_by,
            created_at,
            updated_at
        )
        SELECT
            org_id,
            version,
            approved_reasons,
            high_value_comp_threshold,
            high_comp_pct_threshold,
            daily_comp_pct_warning,
            daily_comp_pct_critical,
            server_max_comp_amount,
            manager_min_for_high_value,
            ARRAY(SELECT jsonb_array_elements_text(manager_roles)),  -- Cast JSONB array to TEXT[]
            ai_model,
            ai_max_tokens,
            ai_temperature,
            effective_from,
            effective_to,
            is_active,
            superseded_by_org_id,
            superseded_by_version,
            created_by,
            created_at,
            updated_at
        FROM comp_settings
        ON CONFLICT (org_id, version) DO NOTHING;

        RAISE NOTICE 'Migrated % rows from comp_settings to operational_standards',
            (SELECT COUNT(*) FROM comp_settings);
    END IF;
END $$;

-- ── 6. SEED DEFAULT STANDARDS ──────────────────────────────────────────────

-- Insert default standards for organizations that don't have any
INSERT INTO operational_standards (
    org_id,
    version,
    comp_approved_reasons,
    created_by
)
SELECT
    id as org_id,
    1 as version,
    jsonb_build_array(
        jsonb_build_object('name', 'Drink Tickets', 'requires_manager_approval', false, 'max_amount', null),
        jsonb_build_object('name', 'Promoter / Customer Development', 'requires_manager_approval', true, 'max_amount', null),
        jsonb_build_object('name', 'Guest Recovery', 'requires_manager_approval', false, 'max_amount', 100),
        jsonb_build_object('name', 'Black Card', 'requires_manager_approval', false, 'max_amount', null),
        jsonb_build_object('name', 'Staff Discount 10%', 'requires_manager_approval', false, 'max_amount', null),
        jsonb_build_object('name', 'Staff Discount 20%', 'requires_manager_approval', false, 'max_amount', null),
        jsonb_build_object('name', 'Staff Discount 25%', 'requires_manager_approval', false, 'max_amount', null),
        jsonb_build_object('name', 'Staff Discount 30%', 'requires_manager_approval', false, 'max_amount', null),
        jsonb_build_object('name', 'Staff Discount 50%', 'requires_manager_approval', true, 'max_amount', null),
        jsonb_build_object('name', 'Executive/Partner Comps', 'requires_manager_approval', true, 'max_amount', null),
        jsonb_build_object('name', 'Goodwill', 'requires_manager_approval', false, 'max_amount', 75),
        jsonb_build_object('name', 'DNL (Did Not Like)', 'requires_manager_approval', false, 'max_amount', 50),
        jsonb_build_object('name', 'Spill / Broken items', 'requires_manager_approval', false, 'max_amount', 50),
        jsonb_build_object('name', 'FOH Mistake', 'requires_manager_approval', false, 'max_amount', 75),
        jsonb_build_object('name', 'BOH Mistake / Wrong Temp', 'requires_manager_approval', false, 'max_amount', 75),
        jsonb_build_object('name', 'Barbuy', 'requires_manager_approval', true, 'max_amount', null),
        jsonb_build_object('name', 'Performer / Band / DJ', 'requires_manager_approval', true, 'max_amount', null),
        jsonb_build_object('name', 'Media / PR / Celebrity', 'requires_manager_approval', true, 'max_amount', null),
        jsonb_build_object('name', 'Manager Meal', 'requires_manager_approval', false, 'max_amount', 30)
    ) as comp_approved_reasons,
    (SELECT id FROM auth.users WHERE email LIKE '%@opsos.%' LIMIT 1) as created_by
FROM organizations
WHERE NOT EXISTS (
    SELECT 1 FROM operational_standards
    WHERE operational_standards.org_id = organizations.id
)
ON CONFLICT (org_id, version) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- COMMENTS & DOCUMENTATION
-- ══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE operational_standards IS
'Unified enforcement standards for comp, labor, and revenue management.

ENFORCEMENT PRINCIPLE:
Companies calibrate sensitivity, not accountability. OpsOS defines what must be reviewed.

INVARIANT RULES:
- Targets are configurable
- Bounds are not
- Exceptions always fire
- Patterns escalate
- History is immutable';

COMMENT ON COLUMN operational_standards.labor_target_pct IS
'Target labor percentage (OpsOS bounds: 18-28%).
Layer 1: Absolute escalation >30% (non-negotiable)';

COMMENT ON COLUMN operational_standards.labor_splh_floor IS
'Sales Per Labor Hour floor (OpsOS bounds: $55-120).
SPLH < floor → Exception, SPLH < floor × 0.85 → Critical';

COMMENT ON COLUMN operational_standards.labor_cplh_target IS
'Covers Per Labor Hour target (OpsOS bounds: 2.0-6.0).
Default guidance: Fine dining 2.0-2.8, Upscale casual 2.5-3.5, Lounge/club 3.5-5.0';
