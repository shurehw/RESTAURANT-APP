-- ══════════════════════════════════════════════════════════════════════════
-- TIPSEE NIGHTLY CACHE
-- ══════════════════════════════════════════════════════════════════════════
--
-- Caches TipSee nightly report data in Supabase for fast retrieval.
-- Synced via cron job at 3am daily.
--
-- PERFORMANCE BENEFIT:
-- - Live TipSee query: 10-60 seconds (10 queries to Azure PostgreSQL)
-- - Cached query: <1 second (1 query to local Supabase)
--
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. NIGHTLY REPORT CACHE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tipsee_nightly_cache (
    -- Primary key
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    business_date DATE NOT NULL,

    -- TipSee identifiers
    location_uuid TEXT NOT NULL, -- TipSee location UUID
    location_name TEXT NOT NULL, -- TipSee location name

    -- Full report payload (JSONB for flexibility)
    report_data JSONB NOT NULL,

    -- Metadata
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    query_duration_ms INTEGER, -- How long the TipSee query took

    -- Composite primary key
    PRIMARY KEY (venue_id, business_date)
);

-- Indexes
CREATE INDEX idx_tipsee_cache_date ON tipsee_nightly_cache(business_date DESC);
CREATE INDEX idx_tipsee_cache_location ON tipsee_nightly_cache(location_uuid);
CREATE INDEX idx_tipsee_cache_synced ON tipsee_nightly_cache(synced_at DESC);

-- ── 2. SYNC LOG ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tipsee_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_date DATE NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    venues_synced INTEGER DEFAULT 0,
    venues_failed INTEGER DEFAULT 0,
    total_duration_ms INTEGER,
    error_message TEXT,

    -- Metadata
    triggered_by TEXT, -- 'cron' or 'manual'
    cron_job_id TEXT
);

CREATE INDEX idx_tipsee_sync_log_date ON tipsee_sync_log(sync_date DESC);
CREATE INDEX idx_tipsee_sync_log_status ON tipsee_sync_log(status, started_at DESC);

-- ── 3. RLS POLICIES ─────────────────────────────────────────────────────────

ALTER TABLE tipsee_nightly_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipsee_sync_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role has full access to tipsee_nightly_cache"
    ON tipsee_nightly_cache
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to tipsee_sync_log"
    ON tipsee_sync_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Users can view cached reports for their venues
CREATE POLICY "Users can view cached reports for their venues"
    ON tipsee_nightly_cache
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

-- Admins can view sync logs
CREATE POLICY "Admins can view sync logs"
    ON tipsee_sync_log
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM organization_users
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'owner')
            AND is_active = TRUE
        )
    );

-- ── 4. HELPER FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Get cached nightly report for a venue and date
 */
CREATE OR REPLACE FUNCTION get_cached_nightly_report(
    p_venue_id UUID,
    p_business_date DATE
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT report_data
    FROM tipsee_nightly_cache
    WHERE venue_id = p_venue_id
    AND business_date = p_business_date
    LIMIT 1;
$$;

/**
 * Get latest sync status
 */
CREATE OR REPLACE FUNCTION get_latest_tipsee_sync()
RETURNS TABLE (
    sync_date DATE,
    status TEXT,
    venues_synced INTEGER,
    venues_failed INTEGER,
    duration_seconds NUMERIC,
    completed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        sync_date,
        status,
        venues_synced,
        venues_failed,
        ROUND((total_duration_ms / 1000.0)::numeric, 2) as duration_seconds,
        completed_at
    FROM tipsee_sync_log
    ORDER BY started_at DESC
    LIMIT 1;
$$;

-- ── 5. COMMENTS ─────────────────────────────────────────────────────────────

COMMENT ON TABLE tipsee_nightly_cache IS
'Cached TipSee nightly reports for fast retrieval. Synced via cron at 3am daily.';

COMMENT ON COLUMN tipsee_nightly_cache.report_data IS
'Full TipSee nightly report as JSONB - includes summary, servers, menu items, comps, etc.';

COMMENT ON COLUMN tipsee_nightly_cache.query_duration_ms IS
'How long the TipSee query took during sync (for performance monitoring)';

COMMENT ON TABLE tipsee_sync_log IS
'Audit log for TipSee sync jobs. Tracks success/failure and performance metrics.';
