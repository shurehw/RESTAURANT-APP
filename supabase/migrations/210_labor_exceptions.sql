-- ══════════════════════════════════════════════════════════════════════════
-- LABOR EXCEPTIONS TABLE
-- ══════════════════════════════════════════════════════════════════════════
--
-- Stores historical labor exceptions for structural trigger tracking
-- and reporting.
--
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS labor_exceptions (
    -- Primary key
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    business_date DATE NOT NULL,
    exception_type TEXT NOT NULL,
    PRIMARY KEY (venue_id, business_date, exception_type),

    -- Exception details
    severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical', 'structural')),
    diagnostic TEXT NOT NULL CHECK (diagnostic IN (
        'overstaffed_slow',
        'overstaffed_busy',
        'understaffed_or_pacing',
        'efficient'
    )),
    message TEXT NOT NULL,

    -- Metrics
    actual_value DECIMAL(10,2) NOT NULL,
    expected_value DECIMAL(10,2) NOT NULL,
    variance_pct DECIMAL(10,2) NOT NULL,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_labor_exceptions_venue_date ON labor_exceptions(venue_id, business_date DESC);
CREATE INDEX idx_labor_exceptions_severity ON labor_exceptions(venue_id, severity, business_date DESC);
CREATE INDEX idx_labor_exceptions_diagnostic ON labor_exceptions(diagnostic);

-- RLS Policies
ALTER TABLE labor_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to labor_exceptions"
    ON labor_exceptions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can view their venue's labor exceptions"
    ON labor_exceptions
    FOR SELECT
    TO authenticated
    USING (
        venue_id IN (
            SELECT v.id FROM venues v
            INNER JOIN organization_users ou ON ou.organization_id = v.organization_id
            WHERE ou.user_id = auth.uid()
            AND ou.is_active = TRUE
        )
    );

-- Comments
COMMENT ON TABLE labor_exceptions IS
'Historical labor exceptions for structural trigger tracking.

Used to detect patterns:
- 3 exceptions in 7 days → Structural review
- 5 exceptions in 14 days → Structural review
- 2 critical exceptions in 7 days → Structural review';

COMMENT ON COLUMN labor_exceptions.diagnostic IS
'Integrated diagnostic from SPLH + CPLH matrix:
- overstaffed_slow: SPLH ❌ CPLH ❌ (Critical)
- overstaffed_busy: SPLH ❌ CPLH ✅ (Staffing level issue)
- understaffed_or_pacing: SPLH ✅ CPLH ❌ (Deployment issue)
- efficient: SPLH ✅ CPLH ✅ (No exception)';
