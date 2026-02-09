-- ══════════════════════════════════════════════════════════════════════════
-- SYSTEM BOUNDS (Layer 0 - Super Admin Controls)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Global enforcement boundaries that constrain all organizational standards.
-- Only super admins can modify these.
--
-- HIERARCHY:
-- Layer 0: System Bounds (this table) - Super admin sets global min/max
-- Layer 1: Org Standards - Orgs calibrate within system bounds
-- Layer 2: Venue Targets - Venues inherit org standards
--
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. SYSTEM BOUNDS TABLE ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_bounds (
    -- Primary key (version-based)
    version INTEGER PRIMARY KEY,

    -- Labor Percentage Bounds
    labor_pct_min DECIMAL(5,2) NOT NULL DEFAULT 18,
    labor_pct_max DECIMAL(5,2) NOT NULL DEFAULT 28,
    labor_pct_tolerance_min DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    labor_pct_tolerance_max DECIMAL(5,2) NOT NULL DEFAULT 2.0,
    labor_pct_absolute_escalation DECIMAL(5,2) NOT NULL DEFAULT 30,

    -- SPLH (Sales Per Labor Hour) Bounds
    splh_min DECIMAL(10,2) NOT NULL DEFAULT 55,
    splh_max DECIMAL(10,2) NOT NULL DEFAULT 120,
    splh_critical_multiplier DECIMAL(3,2) NOT NULL DEFAULT 0.85,

    -- CPLH (Covers Per Labor Hour) Bounds
    cplh_min DECIMAL(5,2) NOT NULL DEFAULT 2.0,
    cplh_max DECIMAL(5,2) NOT NULL DEFAULT 6.0,
    cplh_critical_tolerance DECIMAL(5,2) NOT NULL DEFAULT 0.8,

    -- Structural Trigger Bounds
    structural_exceptions_7d INTEGER NOT NULL DEFAULT 3,
    structural_exceptions_14d INTEGER NOT NULL DEFAULT 5,
    structural_critical_7d INTEGER NOT NULL DEFAULT 2,

    -- Version control & metadata
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    superseded_by_version INTEGER REFERENCES system_bounds(version),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT version_positive CHECK (version > 0),
    CONSTRAINT one_active_version CHECK (
        (is_active = true AND effective_to IS NULL) OR
        (is_active = false AND effective_to IS NOT NULL)
    ),

    -- Sanity checks on bounds
    CONSTRAINT labor_pct_range_valid CHECK (labor_pct_min < labor_pct_max),
    CONSTRAINT splh_range_valid CHECK (splh_min < splh_max),
    CONSTRAINT cplh_range_valid CHECK (cplh_min < cplh_max),
    CONSTRAINT labor_tolerance_range_valid CHECK (labor_pct_tolerance_min < labor_pct_tolerance_max)
);

-- Indexes
CREATE UNIQUE INDEX idx_system_bounds_active ON system_bounds(is_active) WHERE is_active = true;
CREATE INDEX idx_system_bounds_effective ON system_bounds(effective_from, effective_to);

-- ── 2. RLS POLICIES ─────────────────────────────────────────────────────────

ALTER TABLE system_bounds ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role has full access to system_bounds"
    ON system_bounds
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- All authenticated users can VIEW system bounds (they need to see Layer 0)
CREATE POLICY "All users can view system bounds"
    ON system_bounds
    FOR SELECT
    TO authenticated
    USING (true);

-- Only super admins can UPDATE system bounds
-- Super admin = user with email jacob@hwoodgroup.com or harsh@thebinyangroup.com
CREATE POLICY "Only super admins can manage system bounds"
    ON system_bounds
    FOR ALL
    TO authenticated
    USING (
        auth.email() IN (
            'jacob@hwoodgroup.com',
            'harsh@thebinyangroup.com'
        )
    )
    WITH CHECK (
        auth.email() IN (
            'jacob@hwoodgroup.com',
            'harsh@thebinyangroup.com'
        )
    );

-- ── 3. HELPER FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Get active system bounds
 */
CREATE OR REPLACE FUNCTION get_active_system_bounds()
RETURNS TABLE (
    version INTEGER,
    labor_pct_min DECIMAL,
    labor_pct_max DECIMAL,
    labor_pct_tolerance_min DECIMAL,
    labor_pct_tolerance_max DECIMAL,
    labor_pct_absolute_escalation DECIMAL,
    splh_min DECIMAL,
    splh_max DECIMAL,
    splh_critical_multiplier DECIMAL,
    cplh_min DECIMAL,
    cplh_max DECIMAL,
    cplh_critical_tolerance DECIMAL,
    structural_exceptions_7d INTEGER,
    structural_exceptions_14d INTEGER,
    structural_critical_7d INTEGER,
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        version,
        labor_pct_min,
        labor_pct_max,
        labor_pct_tolerance_min,
        labor_pct_tolerance_max,
        labor_pct_absolute_escalation,
        splh_min,
        splh_max,
        splh_critical_multiplier,
        cplh_min,
        cplh_max,
        cplh_critical_tolerance,
        structural_exceptions_7d,
        structural_exceptions_14d,
        structural_critical_7d,
        effective_from,
        effective_to
    FROM system_bounds
    WHERE is_active = true
    AND effective_from <= NOW()
    AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
$$;

/**
 * Get system bounds as of a specific date (for historical queries)
 */
CREATE OR REPLACE FUNCTION get_system_bounds_at(p_as_of TIMESTAMPTZ)
RETURNS TABLE (
    version INTEGER,
    labor_pct_min DECIMAL,
    labor_pct_max DECIMAL,
    splh_min DECIMAL,
    splh_max DECIMAL,
    cplh_min DECIMAL,
    cplh_max DECIMAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        version,
        labor_pct_min,
        labor_pct_max,
        splh_min,
        splh_max,
        cplh_min,
        cplh_max
    FROM system_bounds
    WHERE effective_from <= p_as_of
    AND (effective_to IS NULL OR effective_to > p_as_of)
    ORDER BY effective_from DESC
    LIMIT 1;
$$;

-- ── 4. AUDIT LOGGING ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_bounds_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version INTEGER NOT NULL REFERENCES system_bounds(version),
    action TEXT NOT NULL CHECK (action IN ('created', 'superseded', 'activated', 'deactivated')),
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changes JSONB,
    impact_note TEXT  -- e.g., "Affects 15 organizations, 42 venues"
);

CREATE INDEX idx_system_bounds_audit_version ON system_bounds_audit(version, changed_at DESC);

-- Audit trigger
CREATE OR REPLACE FUNCTION audit_system_bounds_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO system_bounds_audit (version, action, changed_by, changes)
        VALUES (NEW.version, 'created', NEW.created_by, row_to_json(NEW)::jsonb);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_active = true AND NEW.is_active = false THEN
            INSERT INTO system_bounds_audit (version, action, changed_by, changes)
            VALUES (NEW.version, 'superseded', NEW.created_by,
                jsonb_build_object(
                    'superseded_by_version', NEW.superseded_by_version
                )
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER audit_system_bounds
    AFTER INSERT OR UPDATE ON system_bounds
    FOR EACH ROW
    EXECUTE FUNCTION audit_system_bounds_changes();

-- ── 5. SEED DEFAULT SYSTEM BOUNDS ──────────────────────────────────────────

-- Insert version 1 with current hardcoded values
INSERT INTO system_bounds (
    version,
    labor_pct_min,
    labor_pct_max,
    labor_pct_tolerance_min,
    labor_pct_tolerance_max,
    labor_pct_absolute_escalation,
    splh_min,
    splh_max,
    splh_critical_multiplier,
    cplh_min,
    cplh_max,
    cplh_critical_tolerance,
    structural_exceptions_7d,
    structural_exceptions_14d,
    structural_critical_7d,
    created_by
) VALUES (
    1,
    18,     -- labor_pct_min
    28,     -- labor_pct_max
    1.5,    -- labor_pct_tolerance_min
    2.0,    -- labor_pct_tolerance_max
    30,     -- labor_pct_absolute_escalation
    55,     -- splh_min
    120,    -- splh_max
    0.85,   -- splh_critical_multiplier
    2.0,    -- cplh_min
    6.0,    -- cplh_max
    0.8,    -- cplh_critical_tolerance
    3,      -- structural_exceptions_7d
    5,      -- structural_exceptions_14d
    2,      -- structural_critical_7d
    (SELECT id FROM auth.users WHERE email = 'jacob@hwoodgroup.com' LIMIT 1)
)
ON CONFLICT (version) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- COMMENTS & DOCUMENTATION
-- ══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE system_bounds IS
'Global enforcement boundaries (Layer 0) that constrain all organizational standards.

HIERARCHY:
- Layer 0 (System Bounds): Super admin sets global min/max for all orgs
- Layer 1 (Org Standards): Orgs calibrate within Layer 0 bounds
- Layer 2 (Venue Targets): Venues inherit org standards

Only super admins can modify these bounds.';

COMMENT ON COLUMN system_bounds.labor_pct_min IS
'Minimum allowed labor % target that any org can set (e.g., 18%)';

COMMENT ON COLUMN system_bounds.labor_pct_max IS
'Maximum allowed labor % target that any org can set (e.g., 28%)';

COMMENT ON COLUMN system_bounds.labor_pct_absolute_escalation IS
'Non-negotiable critical threshold - any org exceeding this triggers absolute escalation';
