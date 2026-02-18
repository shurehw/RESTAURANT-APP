-- ============================================================================
-- SIMPHONY BI API INTEGRATION
-- Direct Oracle Simphony Business Intelligence API polling for venues using
-- Simphony POS (e.g. Dallas). Bypasses TipSee's batch sync for live data.
--
-- Architecture: Bootstrap script → PKCE auth → tokens stored here →
-- poll endpoint reads tokens → calls BI API → stores sales_snapshots.
-- ============================================================================

-- ============================================================================
-- 1. TOKEN STORAGE — One row per org, auto-refreshed by poll service
-- ============================================================================

CREATE TABLE IF NOT EXISTS simphony_bi_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_identifier TEXT NOT NULL,
  client_id TEXT NOT NULL,
  auth_server TEXT NOT NULL,
  app_server TEXT NOT NULL,

  -- OAuth2 tokens (id_token is the Bearer token for API calls)
  id_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_simphony_bi_org UNIQUE (org_identifier)
);

-- ============================================================================
-- 2. LOCATION MAPPING — Maps OpSOS venue_id → Simphony locRef
-- ============================================================================

CREATE TABLE IF NOT EXISTS simphony_bi_location_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  loc_ref TEXT NOT NULL,
  org_identifier TEXT NOT NULL,
  bar_revenue_centers INT[] NOT NULL DEFAULT '{2}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_simphony_bi_venue UNIQUE (venue_id)
);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE simphony_bi_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE simphony_bi_location_mapping ENABLE ROW LEVEL SECURITY;

-- Service role full access (tokens are managed by poll service only)
CREATE POLICY "Service role full access simphony_bi_tokens"
  ON simphony_bi_tokens FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access simphony_bi_location_mapping"
  ON simphony_bi_location_mapping FOR ALL TO service_role USING (true);

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON TABLE simphony_bi_tokens IS 'OAuth2 PKCE tokens for Oracle Simphony BI API. One row per org. Auto-refreshed by the sales poll service.';
COMMENT ON TABLE simphony_bi_location_mapping IS 'Maps OpSOS venue IDs to Simphony location references (locRef) for direct API polling.';
