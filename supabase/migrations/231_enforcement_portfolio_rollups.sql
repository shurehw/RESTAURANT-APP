-- ============================================================
-- 231: Enforcement Portfolio Rollups
--
-- Pre-computed daily enforcement scorecard per org + venue.
-- Feeds the Home page in <2s instead of live TipSee queries.
-- Recomputed nightly via cron after all syncs complete.
-- ============================================================

-- Portfolio-level + venue-level enforcement rollups
CREATE TABLE IF NOT EXISTS enforcement_portfolio_rollups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  venue_id        UUID REFERENCES venues(id),   -- NULL = portfolio-wide rollup
  rollup_date     DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Attestation compliance
  attestation_expected     INT NOT NULL DEFAULT 0,
  attestation_submitted    INT NOT NULL DEFAULT 0,
  attestation_late         INT NOT NULL DEFAULT 0,
  attestation_missed       INT NOT NULL DEFAULT 0,
  attestation_compliance_pct NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN attestation_expected > 0
      THEN ROUND((attestation_submitted::NUMERIC / attestation_expected) * 100, 2)
      ELSE 0
    END
  ) STORED,

  -- Open enforcement items (from unified_enforcement_items)
  carry_forward_count      INT NOT NULL DEFAULT 0,
  critical_open_count      INT NOT NULL DEFAULT 0,
  escalated_count          INT NOT NULL DEFAULT 0,

  -- Exception counts by domain
  comp_exception_count     INT NOT NULL DEFAULT 0,
  labor_exception_count    INT NOT NULL DEFAULT 0,
  procurement_exception_count INT NOT NULL DEFAULT 0,
  revenue_variance_count   INT NOT NULL DEFAULT 0,

  -- Revenue summary (from venue_day_facts)
  total_net_revenue        NUMERIC(12,2) DEFAULT 0,
  total_covers             INT DEFAULT 0,
  avg_check                NUMERIC(8,2) DEFAULT 0,

  -- Labor summary (from labor_day_facts)
  total_labor_cost         NUMERIC(12,2) DEFAULT 0,
  labor_pct                NUMERIC(5,2) DEFAULT 0,

  -- Top risk venues (portfolio row only, NULL for venue rows)
  top_venues_json          JSONB,

  -- Metadata
  computed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  compute_duration_ms      INT,

  UNIQUE(org_id, venue_id, rollup_date)
);

-- Indexes for fast lookup
CREATE INDEX idx_epr_org_date ON enforcement_portfolio_rollups(org_id, rollup_date DESC);
CREATE INDEX idx_epr_org_venue_date ON enforcement_portfolio_rollups(org_id, venue_id, rollup_date DESC)
  WHERE venue_id IS NOT NULL;
CREATE INDEX idx_epr_portfolio ON enforcement_portfolio_rollups(org_id, rollup_date DESC)
  WHERE venue_id IS NULL;

-- RLS
ALTER TABLE enforcement_portfolio_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to rollups"
  ON enforcement_portfolio_rollups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view their org rollups"
  ON enforcement_portfolio_rollups FOR SELECT
  USING (
    org_id IN (
      SELECT ou.organization_id
      FROM organization_users ou
      WHERE ou.user_id = auth.uid() AND ou.is_active = true
    )
  );

-- ============================================================
-- Function: recompute_enforcement_rollups
-- Called by nightly cron after all data syncs complete.
-- Computes portfolio + per-venue rollups for a given date.
-- ============================================================
CREATE OR REPLACE FUNCTION recompute_enforcement_rollups(
  p_org_id UUID,
  p_date   DATE DEFAULT CURRENT_DATE
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_venue RECORD;
  v_count INT := 0;

  -- Portfolio accumulators
  p_att_expected INT := 0;
  p_att_submitted INT := 0;
  p_att_late INT := 0;
  p_att_missed INT := 0;
  p_carry INT := 0;
  p_critical INT := 0;
  p_escalated INT := 0;
  p_comp_exc INT := 0;
  p_labor_exc INT := 0;
  p_proc_exc INT := 0;
  p_rev_var INT := 0;
  p_revenue NUMERIC := 0;
  p_covers INT := 0;
  p_labor_cost NUMERIC := 0;

  v_venue_risks JSONB := '[]'::JSONB;
BEGIN
  -- Process each venue in the org
  FOR v_venue IN
    SELECT v.id, v.name
    FROM venues v
    WHERE v.organization_id = p_org_id AND v.is_active = true
  LOOP
    DECLARE
      v_att_expected INT := 1;  -- 1 attestation expected per venue per day
      v_att_submitted INT := 0;
      v_att_late INT := 0;
      v_att_missed INT := 0;
      v_carry INT := 0;
      v_critical INT := 0;
      v_escalated INT := 0;
      v_comp_exc INT := 0;
      v_labor_exc INT := 0;
      v_proc_exc INT := 0;
      v_rev_var INT := 0;
      v_revenue NUMERIC := 0;
      v_covers INT := 0;
      v_labor_cost NUMERIC := 0;
      v_labor_pct NUMERIC := 0;
      v_avg_check NUMERIC := 0;
      v_risk_score INT := 0;
    BEGIN
      -- Attestation status
      SELECT
        CASE WHEN na.status IN ('submitted', 'amended') THEN 1 ELSE 0 END,
        CASE WHEN na.status = 'submitted' AND na.submitted_at > (p_date + INTERVAL '1 day' + INTERVAL '5 hours') THEN 1 ELSE 0 END,
        CASE WHEN na.status = 'draft' OR na.id IS NULL THEN 1 ELSE 0 END
      INTO v_att_submitted, v_att_late, v_att_missed
      FROM nightly_attestations na
      WHERE na.venue_id = v_venue.id AND na.business_date = p_date;

      -- If no attestation row exists, it's missed
      IF NOT FOUND THEN
        v_att_submitted := 0;
        v_att_late := 0;
        v_att_missed := 1;
      END IF;

      -- Open enforcement items (manager_actions)
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')),
        COUNT(*) FILTER (WHERE priority = 'urgent' AND status IN ('pending', 'in_progress')),
        COUNT(*) FILTER (WHERE status = 'escalated')
      INTO v_carry, v_critical, v_escalated
      FROM manager_actions
      WHERE venue_id = v_venue.id
        AND status IN ('pending', 'in_progress', 'escalated')
        AND (expires_at IS NULL OR expires_at > NOW());

      -- Also count feedback_objects
      DECLARE
        fb_carry INT := 0;
        fb_critical INT := 0;
        fb_escalated INT := 0;
      BEGIN
        SELECT
          COUNT(*) FILTER (WHERE status IN ('open', 'acknowledged', 'in_progress')),
          COUNT(*) FILTER (WHERE severity = 'critical' AND status IN ('open', 'acknowledged', 'in_progress')),
          COUNT(*) FILTER (WHERE status = 'escalated')
        INTO fb_carry, fb_critical, fb_escalated
        FROM feedback_objects
        WHERE venue_id = v_venue.id
          AND status IN ('open', 'acknowledged', 'in_progress', 'escalated');

        v_carry := v_carry + fb_carry;
        v_critical := v_critical + fb_critical;
        v_escalated := v_escalated + fb_escalated;
      EXCEPTION WHEN undefined_table THEN
        NULL; -- feedback_objects may not exist yet
      END;

      -- Labor exceptions for this date
      SELECT COUNT(*)
      INTO v_labor_exc
      FROM labor_exceptions
      WHERE venue_id = v_venue.id AND business_date = p_date;

      -- Revenue + labor from fact tables
      SELECT COALESCE(vdf.net_sales, 0), COALESCE(vdf.covers, 0), COALESCE(vdf.avg_check, 0)
      INTO v_revenue, v_covers, v_avg_check
      FROM venue_day_facts vdf
      WHERE vdf.venue_id = v_venue.id AND vdf.business_date = p_date;

      IF NOT FOUND THEN
        v_revenue := 0; v_covers := 0; v_avg_check := 0;
      END IF;

      SELECT COALESCE(ldf.labor_cost, 0), COALESCE(ldf.labor_pct, 0)
      INTO v_labor_cost, v_labor_pct
      FROM labor_day_facts ldf
      WHERE ldf.venue_id = v_venue.id AND ldf.business_date = p_date;

      IF NOT FOUND THEN
        v_labor_cost := 0; v_labor_pct := 0;
      END IF;

      -- Compute risk score for this venue
      v_risk_score := v_att_missed * 10 + v_critical * 5 + v_escalated * 3 + v_carry + v_labor_exc * 2;

      -- Upsert venue rollup
      INSERT INTO enforcement_portfolio_rollups (
        org_id, venue_id, rollup_date,
        attestation_expected, attestation_submitted, attestation_late, attestation_missed,
        carry_forward_count, critical_open_count, escalated_count,
        comp_exception_count, labor_exception_count, procurement_exception_count, revenue_variance_count,
        total_net_revenue, total_covers, avg_check,
        total_labor_cost, labor_pct,
        computed_at
      ) VALUES (
        p_org_id, v_venue.id, p_date,
        v_att_expected, v_att_submitted, v_att_late, v_att_missed,
        v_carry, v_critical, v_escalated,
        v_comp_exc, v_labor_exc, v_proc_exc, v_rev_var,
        v_revenue, v_covers, v_avg_check,
        v_labor_cost, v_labor_pct,
        NOW()
      )
      ON CONFLICT (org_id, venue_id, rollup_date)
      DO UPDATE SET
        attestation_expected = EXCLUDED.attestation_expected,
        attestation_submitted = EXCLUDED.attestation_submitted,
        attestation_late = EXCLUDED.attestation_late,
        attestation_missed = EXCLUDED.attestation_missed,
        carry_forward_count = EXCLUDED.carry_forward_count,
        critical_open_count = EXCLUDED.critical_open_count,
        escalated_count = EXCLUDED.escalated_count,
        comp_exception_count = EXCLUDED.comp_exception_count,
        labor_exception_count = EXCLUDED.labor_exception_count,
        procurement_exception_count = EXCLUDED.procurement_exception_count,
        revenue_variance_count = EXCLUDED.revenue_variance_count,
        total_net_revenue = EXCLUDED.total_net_revenue,
        total_covers = EXCLUDED.total_covers,
        avg_check = EXCLUDED.avg_check,
        total_labor_cost = EXCLUDED.total_labor_cost,
        labor_pct = EXCLUDED.labor_pct,
        computed_at = NOW();

      v_count := v_count + 1;

      -- Accumulate portfolio totals
      p_att_expected := p_att_expected + v_att_expected;
      p_att_submitted := p_att_submitted + v_att_submitted;
      p_att_late := p_att_late + v_att_late;
      p_att_missed := p_att_missed + v_att_missed;
      p_carry := p_carry + v_carry;
      p_critical := p_critical + v_critical;
      p_escalated := p_escalated + v_escalated;
      p_comp_exc := p_comp_exc + v_comp_exc;
      p_labor_exc := p_labor_exc + v_labor_exc;
      p_proc_exc := p_proc_exc + v_proc_exc;
      p_rev_var := p_rev_var + v_rev_var;
      p_revenue := p_revenue + v_revenue;
      p_covers := p_covers + v_covers;
      p_labor_cost := p_labor_cost + v_labor_cost;

      -- Add to risk ranking
      IF v_risk_score > 0 THEN
        v_venue_risks := v_venue_risks || jsonb_build_object(
          'venue_id', v_venue.id,
          'venue_name', v_venue.name,
          'risk_score', v_risk_score,
          'missed_attestation', v_att_missed > 0,
          'critical_items', v_critical,
          'carry_forward', v_carry,
          'labor_exceptions', v_labor_exc
        );
      END IF;
    END;
  END LOOP;

  -- Sort venue risks by score descending, keep top 10
  v_venue_risks := (
    SELECT COALESCE(jsonb_agg(elem ORDER BY (elem->>'risk_score')::INT DESC), '[]'::JSONB)
    FROM jsonb_array_elements(v_venue_risks) AS elem
    LIMIT 10
  );

  -- Upsert portfolio-wide rollup (venue_id = NULL)
  INSERT INTO enforcement_portfolio_rollups (
    org_id, venue_id, rollup_date,
    attestation_expected, attestation_submitted, attestation_late, attestation_missed,
    carry_forward_count, critical_open_count, escalated_count,
    comp_exception_count, labor_exception_count, procurement_exception_count, revenue_variance_count,
    total_net_revenue, total_covers,
    avg_check,
    total_labor_cost, labor_pct,
    top_venues_json,
    computed_at,
    compute_duration_ms
  ) VALUES (
    p_org_id, NULL, p_date,
    p_att_expected, p_att_submitted, p_att_late, p_att_missed,
    p_carry, p_critical, p_escalated,
    p_comp_exc, p_labor_exc, p_proc_exc, p_rev_var,
    p_revenue, p_covers,
    CASE WHEN p_covers > 0 THEN ROUND(p_revenue / p_covers, 2) ELSE 0 END,
    p_labor_cost,
    CASE WHEN p_revenue > 0 THEN ROUND((p_labor_cost / p_revenue) * 100, 2) ELSE 0 END,
    v_venue_risks,
    NOW(),
    EXTRACT(EPOCH FROM (clock_timestamp() - v_start))::INT * 1000
  )
  ON CONFLICT (org_id, venue_id, rollup_date)
  DO UPDATE SET
    attestation_expected = EXCLUDED.attestation_expected,
    attestation_submitted = EXCLUDED.attestation_submitted,
    attestation_late = EXCLUDED.attestation_late,
    attestation_missed = EXCLUDED.attestation_missed,
    carry_forward_count = EXCLUDED.carry_forward_count,
    critical_open_count = EXCLUDED.critical_open_count,
    escalated_count = EXCLUDED.escalated_count,
    comp_exception_count = EXCLUDED.comp_exception_count,
    labor_exception_count = EXCLUDED.labor_exception_count,
    procurement_exception_count = EXCLUDED.procurement_exception_count,
    revenue_variance_count = EXCLUDED.revenue_variance_count,
    total_net_revenue = EXCLUDED.total_net_revenue,
    total_covers = EXCLUDED.total_covers,
    avg_check = EXCLUDED.avg_check,
    total_labor_cost = EXCLUDED.total_labor_cost,
    labor_pct = EXCLUDED.labor_pct,
    top_venues_json = EXCLUDED.top_venues_json,
    computed_at = NOW(),
    compute_duration_ms = EXCLUDED.compute_duration_ms;

  v_count := v_count + 1;

  RETURN v_count;
END;
$$;
