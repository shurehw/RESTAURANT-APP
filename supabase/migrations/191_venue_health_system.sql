-- ============================================================================
-- VENUE HEALTH RATING SYSTEM — OpsOS Core Primitive
-- Supabase Schema + Computation Function + Trigger Matrix
-- ============================================================================
-- Deploy order: 1) Tables/indexes  2) Functions  3) Policies  4) Cron
-- ============================================================================


-- ============================================================================
-- PART 1: SCHEMA
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1A) Signal weights — tunable per venue class, no code changes needed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_health_weights (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_class  text NOT NULL DEFAULT 'default',
  signal       text NOT NULL,  -- reviews | sales | labor | leakage | flow | integrity
  weight       numeric(4,3) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  enabled      boolean DEFAULT true,
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(venue_class, signal)
);

-- Seed default weights
INSERT INTO venue_health_weights (venue_class, signal, weight) VALUES
  ('default', 'reviews',   0.150),
  ('default', 'sales',     0.200),
  ('default', 'labor',     0.200),
  ('default', 'leakage',   0.200),
  ('default', 'flow',      0.150),
  ('default', 'integrity', 0.100)
ON CONFLICT (venue_class, signal) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1B) Daily signal scores — one row per venue × date × signal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_health_signals_daily (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES venues(id),
  date          date NOT NULL,
  signal        text NOT NULL,  -- reviews | sales | labor | leakage | flow | integrity
  risk          numeric(5,4) NOT NULL CHECK (risk >= 0 AND risk <= 1),
  confidence    numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  reason        text,          -- human-readable driver explanation
  raw_inputs    jsonb,         -- source data for audit trail
  computed_at   timestamptz DEFAULT now(),
  UNIQUE(venue_id, date, signal)
);

CREATE INDEX idx_health_signals_venue_date ON venue_health_signals_daily (venue_id, date);
CREATE INDEX idx_health_signals_date ON venue_health_signals_daily (date DESC);

-- ---------------------------------------------------------------------------
-- 1C) Daily composite health score — one row per venue × date
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_health_daily (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid NOT NULL REFERENCES venues(id),
  date            date NOT NULL,
  health_score    numeric(5,2) NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  status          text NOT NULL CHECK (status IN ('GREEN','YELLOW','ORANGE','RED')),
  confidence      numeric(5,4) NOT NULL DEFAULT 1.0,
  top_drivers     jsonb,        -- array of {signal, risk, weight, reason}
  signal_count    int NOT NULL DEFAULT 0,
  computed_at     timestamptz DEFAULT now(),
  UNIQUE(venue_id, date)
);

CREATE INDEX idx_health_daily_venue_date ON venue_health_daily (venue_id, date DESC);
CREATE INDEX idx_health_daily_status ON venue_health_daily (status) WHERE status IN ('ORANGE','RED');

-- ---------------------------------------------------------------------------
-- 1D) Escalation / action log — tracks what the system triggered
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_health_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid NOT NULL REFERENCES venues(id),
  date            date NOT NULL,
  health_score    numeric(5,2) NOT NULL,
  status          text NOT NULL,
  action_type     text NOT NULL,  -- attestation_required | field_lock | escalation | review_required
  action_detail   text,
  assigned_to     uuid,           -- user_id of manager
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_health_actions_open ON venue_health_actions (venue_id, date)
  WHERE completed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 1E) Health thresholds — configurable status boundaries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_health_thresholds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status      text NOT NULL UNIQUE,
  min_score   numeric(5,2) NOT NULL,
  max_score   numeric(5,2) NOT NULL,
  color       text
);

INSERT INTO venue_health_thresholds (status, min_score, max_score, color) VALUES
  ('GREEN',  80, 100, '#22c55e'),
  ('YELLOW', 65, 79.99, '#eab308'),
  ('ORANGE', 50, 64.99, '#f97316'),
  ('RED',    0,  49.99, '#ef4444')
ON CONFLICT (status) DO NOTHING;


-- ============================================================================
-- PART 2: SIGNAL COMPUTATION FUNCTIONS
-- ============================================================================

-- Helper: clamp value to [0,1]
CREATE OR REPLACE FUNCTION clamp01(val numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0, LEAST(1, val));
$$;

-- ---------------------------------------------------------------------------
-- 2A) Compute REVIEWS risk for a venue-day
--     Source: reviews_raw (from migration 190)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_review_risk(
  p_venue_id uuid,
  p_date date
)
RETURNS TABLE(risk numeric, confidence numeric, reason text, raw_inputs jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  v_neg_24h int;
  v_avg_7d numeric;
  v_avg_30d numeric;
  v_rating_delta numeric;
  v_risk numeric;
  v_reason text;
BEGIN
  -- Negative reviews in last 24h
  SELECT COUNT(*) INTO v_neg_24h
  FROM reviews_raw
  WHERE venue_id = p_venue_id
    AND rating <= 2
    AND reviewed_at >= (p_date::timestamptz - interval '24 hours')
    AND reviewed_at < (p_date::timestamptz + interval '1 day');

  -- 7-day avg
  SELECT COALESCE(AVG(rating), 0) INTO v_avg_7d
  FROM reviews_raw
  WHERE venue_id = p_venue_id
    AND reviewed_at >= (p_date - 7)
    AND reviewed_at < (p_date::timestamptz + interval '1 day');

  -- 30-day avg
  SELECT COALESCE(AVG(rating), 0) INTO v_avg_30d
  FROM reviews_raw
  WHERE venue_id = p_venue_id
    AND reviewed_at >= (p_date - 30)
    AND reviewed_at < (p_date::timestamptz + interval '1 day');

  v_rating_delta := v_avg_7d - v_avg_30d;

  -- Risk formula: 50% negative count pressure + 50% trend pressure
  v_risk := clamp01(v_neg_24h::numeric / 2.0) * 0.5
           + clamp01((-v_rating_delta) / 0.5) * 0.5;

  v_reason := format('%s neg reviews 24h | 7d avg %s vs 30d avg %s (delta %s)',
    v_neg_24h, ROUND(v_avg_7d, 2), ROUND(v_avg_30d, 2), ROUND(v_rating_delta, 2));

  RETURN QUERY SELECT
    ROUND(v_risk, 4),
    CASE WHEN v_avg_30d = 0 THEN 0.3::numeric ELSE 1.0::numeric END,
    v_reason,
    jsonb_build_object('neg_24h', v_neg_24h, 'avg_7d', v_avg_7d, 'avg_30d', v_avg_30d, 'delta', v_rating_delta);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2B) Compute SALES risk for a venue-day
--     Source: venue_day_facts (actuals) + venue_day_forecast (predictions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_sales_risk(
  p_venue_id uuid,
  p_date date
)
RETURNS TABLE(risk numeric, confidence numeric, reason text, raw_inputs jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  v_actual numeric;
  v_forecast numeric;
  v_variance numeric;
  v_risk numeric;
BEGIN
  -- Actual net sales from venue_day_facts
  SELECT net_sales INTO v_actual
  FROM venue_day_facts
  WHERE venue_id = p_venue_id AND business_date = p_date;

  -- Forecast from venue_day_forecast (may not exist yet)
  BEGIN
    SELECT yhat INTO v_forecast
    FROM venue_day_forecast
    WHERE venue_id = p_venue_id
      AND business_date = p_date
      AND forecast_type = 'net_sales'
    ORDER BY generated_at DESC
    LIMIT 1;
  EXCEPTION WHEN undefined_table THEN
    v_forecast := NULL;
  END;

  IF v_forecast IS NULL OR v_forecast = 0 THEN
    RETURN QUERY SELECT
      0::numeric,
      CASE WHEN v_actual IS NOT NULL THEN 0.3::numeric ELSE 0.1::numeric END,
      CASE
        WHEN v_actual IS NOT NULL THEN format('Actual $%s — no forecast to compare', ROUND(v_actual))
        ELSE 'No sales or forecast data'::text
      END,
      jsonb_build_object('actual', v_actual, 'forecast', v_forecast);
    RETURN;
  END IF;

  v_variance := (v_actual - v_forecast) / v_forecast;

  -- Hits hard on downside, ignores upside
  v_risk := clamp01(GREATEST(0, -v_variance) / 0.20);

  RETURN QUERY SELECT
    ROUND(v_risk, 4),
    CASE WHEN v_actual IS NULL THEN 0.3::numeric ELSE 1.0::numeric END,
    format('Actual $%s vs Forecast $%s (%s%%)',
      ROUND(v_actual), ROUND(v_forecast), ROUND(v_variance * 100, 1)),
    jsonb_build_object('actual', v_actual, 'forecast', v_forecast, 'variance_pct', ROUND(v_variance * 100, 2));
END;
$$;

-- ---------------------------------------------------------------------------
-- 2C) Compute LEAKAGE risk for a venue-day
--     Source: venue_day_facts (comps_total, voids_total, net_sales)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_leakage_risk(
  p_venue_id uuid,
  p_date date
)
RETURNS TABLE(risk numeric, confidence numeric, reason text, raw_inputs jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  v_comp_pct numeric;
  v_void_pct numeric;
  v_risk numeric;
  v_comps numeric;
  v_voids numeric;
  v_net numeric;
BEGIN
  SELECT comps_total, voids_total, net_sales
  INTO v_comps, v_voids, v_net
  FROM venue_day_facts
  WHERE venue_id = p_venue_id AND business_date = p_date;

  IF v_net IS NULL OR v_net = 0 THEN
    RETURN QUERY SELECT 0::numeric, 0.2::numeric, 'No sales data for leakage calc'::text, '{}'::jsonb;
    RETURN;
  END IF;

  v_comp_pct := COALESCE(v_comps, 0) / v_net;
  v_void_pct := COALESCE(v_voids, 0) / v_net;

  -- Comp risk: 2% baseline OK, full risk at 4%
  -- Void add-on: 0.5% baseline, full add-on at 1.5%
  -- No promo_overrides column available yet, omit that component
  v_risk := clamp01((v_comp_pct - 0.02) / 0.02) * 0.70
          + clamp01((v_void_pct - 0.005) / 0.01) * 0.30;

  RETURN QUERY SELECT
    ROUND(v_risk, 4),
    1.0::numeric,
    format('Comp%% %s%% | Void%% %s%%',
      ROUND(v_comp_pct * 100, 1), ROUND(v_void_pct * 100, 2)),
    jsonb_build_object('comp_pct', ROUND(v_comp_pct * 100, 2), 'void_pct', ROUND(v_void_pct * 100, 3),
      'comps', v_comps, 'voids', v_voids, 'net_sales', v_net);
END;
$$;


-- ============================================================================
-- PART 3: DAILY HEALTH SCORE COMPUTATION (MAIN ORCHESTRATOR)
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_venue_health(
  p_venue_id uuid,
  p_date date,
  p_venue_class text DEFAULT 'default'
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_signal record;
  v_result record;
  v_total_weighted_risk numeric := 0;
  v_total_weight numeric := 0;
  v_total_confidence numeric := 0;
  v_signal_count int := 0;
  v_health numeric;
  v_status text;
  v_drivers jsonb := '[]'::jsonb;
BEGIN

  -- Loop through enabled signals and their weights
  FOR v_signal IN
    SELECT signal, weight
    FROM venue_health_weights
    WHERE venue_class = p_venue_class AND enabled = true
    ORDER BY weight DESC
  LOOP
    -- Compute each signal's risk
    BEGIN
      CASE v_signal.signal
        WHEN 'reviews' THEN
          SELECT r.risk, r.confidence, r.reason, r.raw_inputs INTO v_result
          FROM compute_review_risk(p_venue_id, p_date) r;

        WHEN 'sales' THEN
          SELECT r.risk, r.confidence, r.reason, r.raw_inputs INTO v_result
          FROM compute_sales_risk(p_venue_id, p_date) r;

        WHEN 'leakage' THEN
          SELECT r.risk, r.confidence, r.reason, r.raw_inputs INTO v_result
          FROM compute_leakage_risk(p_venue_id, p_date) r;

        -- WHEN 'labor' THEN ...   (Phase 2)
        -- WHEN 'flow' THEN ...    (Phase 2)
        -- WHEN 'integrity' THEN ...(Phase 2)

        ELSE
          CONTINUE;  -- skip unimplemented signals
      END CASE;

      -- Skip if no result
      IF v_result IS NULL OR v_result.risk IS NULL THEN
        CONTINUE;
      END IF;

      -- Upsert into signals table
      INSERT INTO venue_health_signals_daily (venue_id, date, signal, risk, confidence, reason, raw_inputs)
      VALUES (p_venue_id, p_date, v_signal.signal, v_result.risk, v_result.confidence, v_result.reason, v_result.raw_inputs)
      ON CONFLICT (venue_id, date, signal)
      DO UPDATE SET risk = EXCLUDED.risk, confidence = EXCLUDED.confidence,
                    reason = EXCLUDED.reason, raw_inputs = EXCLUDED.raw_inputs,
                    computed_at = now();

      -- Accumulate
      v_total_weighted_risk := v_total_weighted_risk + (v_signal.weight * v_result.risk);
      v_total_weight := v_total_weight + v_signal.weight;
      v_total_confidence := v_total_confidence + v_result.confidence;
      v_signal_count := v_signal_count + 1;

      -- Build drivers array (sorted by impact = weight × risk)
      v_drivers := v_drivers || jsonb_build_object(
        'signal', v_signal.signal,
        'risk', v_result.risk,
        'weight', v_signal.weight,
        'impact', ROUND(v_signal.weight * v_result.risk, 4),
        'reason', v_result.reason
      );

    EXCEPTION WHEN OTHERS THEN
      -- Log but don't break the whole computation
      RAISE WARNING 'Signal % failed for venue % on %: %', v_signal.signal, p_venue_id, p_date, SQLERRM;
      CONTINUE;
    END;
  END LOOP;

  -- Compute final score
  IF v_signal_count = 0 THEN
    v_health := 0;
    v_status := 'RED';
  ELSE
    -- Normalize if not all signals present (proportional weighting)
    v_health := 100 - 100 * (v_total_weighted_risk / v_total_weight);
    v_health := GREATEST(0, LEAST(100, v_health));
  END IF;

  -- Determine status
  v_status := CASE
    WHEN v_health >= 80 THEN 'GREEN'
    WHEN v_health >= 65 THEN 'YELLOW'
    WHEN v_health >= 50 THEN 'ORANGE'
    ELSE 'RED'
  END;

  -- Sort drivers by impact descending
  SELECT jsonb_agg(elem ORDER BY (elem->>'impact')::numeric DESC)
  INTO v_drivers
  FROM jsonb_array_elements(v_drivers) elem;

  -- Upsert into daily health table
  INSERT INTO venue_health_daily (venue_id, date, health_score, status, confidence, top_drivers, signal_count)
  VALUES (
    p_venue_id,
    p_date,
    ROUND(v_health, 2),
    v_status,
    ROUND(COALESCE(v_total_confidence / NULLIF(v_signal_count, 0), 0), 4),
    v_drivers,
    v_signal_count
  )
  ON CONFLICT (venue_id, date)
  DO UPDATE SET
    health_score = EXCLUDED.health_score,
    status = EXCLUDED.status,
    confidence = EXCLUDED.confidence,
    top_drivers = EXCLUDED.top_drivers,
    signal_count = EXCLUDED.signal_count,
    computed_at = now();

  RETURN jsonb_build_object(
    'venue_id', p_venue_id,
    'date', p_date,
    'health_score', ROUND(v_health, 2),
    'status', v_status,
    'confidence', ROUND(COALESCE(v_total_confidence / NULLIF(v_signal_count, 0), 0), 4),
    'signal_count', v_signal_count,
    'drivers', v_drivers
  );
END;
$$;


-- ============================================================================
-- PART 4: BATCH COMPUTE ALL VENUES
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_all_venue_health(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(venue_id uuid, result jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  v_venue record;
BEGIN
  FOR v_venue IN
    SELECT v.id, COALESCE(v.venue_class::text, 'default') as vc
    FROM venues v
    WHERE v.is_active = true
  LOOP
    venue_id := v_venue.id;
    result := compute_venue_health(v_venue.id, p_date, v_venue.vc);
    RETURN NEXT;
  END LOOP;
END;
$$;


-- ============================================================================
-- PART 5: TRIGGER MATRIX — HEALTH STATE → REQUIRED ACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS venue_health_trigger_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status          text NOT NULL,  -- GREEN | YELLOW | ORANGE | RED
  trigger_signal  text,           -- NULL = any signal, or specific
  action_type     text NOT NULL,  -- attestation_required | field_lock | escalation | review_required | auto_notify
  action_detail   text NOT NULL,
  assign_to_role  text,           -- gm | agm | ops_director | owner
  deadline_hours  int DEFAULT 24,
  enabled         boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- GREEN (80-100): Minimal
INSERT INTO venue_health_trigger_rules (status, trigger_signal, action_type, action_detail, assign_to_role, deadline_hours) VALUES
('GREEN', NULL, 'auto_notify', 'Daily health summary in AM digest — no action required', NULL, NULL);

-- YELLOW (65-79): Watch
INSERT INTO venue_health_trigger_rules (status, trigger_signal, action_type, action_detail, assign_to_role, deadline_hours) VALUES
('YELLOW', NULL,       'attestation_required', 'GM must acknowledge health score and top drivers before EOD', 'gm', 24),
('YELLOW', 'sales',    'auto_notify',          'Sales variance flag sent to GM + AGM with 3-day trend', 'gm', NULL),
('YELLOW', 'leakage',  'review_required',      'GM must review comp/void report and provide written explanation', 'gm', 24),
('YELLOW', 'reviews',  'auto_notify',          'Negative review digest sent to GM with response deadline', 'gm', 12);

-- ORANGE (50-64): Degraded
INSERT INTO venue_health_trigger_rules (status, trigger_signal, action_type, action_detail, assign_to_role, deadline_hours) VALUES
('ORANGE', NULL,       'attestation_required', 'GM must submit written action plan addressing top 2 drivers', 'gm', 12),
('ORANGE', NULL,       'escalation',           'Ops Director notified — venue flagged for daily check-in', 'ops_director', 4),
('ORANGE', 'sales',    'review_required',      'GM must review staffing vs covers and propose next-day adjustment', 'gm', 12),
('ORANGE', 'leakage',  'field_lock',           'Comp/discount fields locked — GM-only override until score recovers to YELLOW', 'gm', NULL),
('ORANGE', 'leakage',  'attestation_required', 'GM must itemize every comp >$50 with business justification', 'gm', 8),
('ORANGE', 'reviews',  'review_required',      'GM must respond to all negative reviews within 12h and log response', 'gm', 12),
('ORANGE', 'labor',    'review_required',      'GM must submit revised schedule for next 3 days', 'gm', 12);

-- RED (<50): Intervention
INSERT INTO venue_health_trigger_rules (status, trigger_signal, action_type, action_detail, assign_to_role, deadline_hours) VALUES
('RED', NULL,       'escalation',           'Owner notified immediately — venue in crisis state', 'owner', 1),
('RED', NULL,       'attestation_required', 'GM must submit root cause analysis + 48h recovery plan', 'gm', 6),
('RED', NULL,       'field_lock',           'All discount/comp/promo fields locked to GM-only', 'gm', NULL),
('RED', 'sales',    'escalation',           'Ops Director must join GM for same-day review call', 'ops_director', 4),
('RED', 'sales',    'review_required',      'Full P&L variance analysis required for trailing 7 days', 'gm', 12),
('RED', 'leakage',  'escalation',           'Forensic comp/void audit triggered — every transaction reviewed', 'ops_director', 8),
('RED', 'leakage',  'field_lock',           'All comps/voids require Ops Director pre-approval until GREEN', 'ops_director', NULL),
('RED', 'reviews',  'attestation_required', 'GM must document each negative review cause + corrective action taken', 'gm', 6),
('RED', 'integrity','escalation',           'Manager behavior audit triggered — attestation and override history reviewed', 'ops_director', 8);


-- ============================================================================
-- PART 6: ENFORCEMENT FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_health_actions(
  p_venue_id uuid,
  p_date date
)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_health record;
  v_rule record;
  v_actions_created int := 0;
  v_top_signals text[];
BEGIN
  SELECT * INTO v_health
  FROM venue_health_daily
  WHERE venue_id = p_venue_id AND date = p_date;

  IF v_health IS NULL THEN
    RETURN 0;
  END IF;

  SELECT ARRAY(
    SELECT elem->>'signal'
    FROM jsonb_array_elements(v_health.top_drivers) elem
  ) INTO v_top_signals;

  FOR v_rule IN
    SELECT *
    FROM venue_health_trigger_rules
    WHERE status = v_health.status
      AND enabled = true
      AND (trigger_signal IS NULL OR trigger_signal = ANY(v_top_signals))
  LOOP
    INSERT INTO venue_health_actions (venue_id, date, health_score, status, action_type, action_detail)
    SELECT p_venue_id, p_date, v_health.health_score, v_health.status, v_rule.action_type, v_rule.action_detail
    WHERE NOT EXISTS (
      SELECT 1 FROM venue_health_actions
      WHERE venue_id = p_venue_id
        AND date = p_date
        AND action_type = v_rule.action_type
        AND action_detail = v_rule.action_detail
    );

    IF FOUND THEN
      v_actions_created := v_actions_created + 1;
    END IF;
  END LOOP;

  RETURN v_actions_created;
END;
$$;


-- ============================================================================
-- PART 7: CRON (uncomment after verifying functions work)
-- ============================================================================

-- Compute health daily at 6:30 AM UTC (captures previous day's data after ETL)
-- SELECT cron.schedule(
--   'compute-venue-health-daily',
--   '30 6 * * *',
--   $$SELECT compute_all_venue_health(CURRENT_DATE - 1)$$
-- );

-- Enforce actions 15 min after health computation
-- SELECT cron.schedule(
--   'enforce-health-actions-daily',
--   '45 6 * * *',
--   $$SELECT enforce_health_actions(v.id, CURRENT_DATE - 1) FROM venues v WHERE v.is_active = true$$
-- );


-- ============================================================================
-- PART 8: RLS POLICIES
-- ============================================================================

ALTER TABLE venue_health_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_health_signals_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_health_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_health_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_health_trigger_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_health_thresholds ENABLE ROW LEVEL SECURITY;

-- Service role: full access (functions run as service role)
CREATE POLICY health_daily_service ON venue_health_daily FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY health_signals_service ON venue_health_signals_daily FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY health_actions_service ON venue_health_actions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY health_weights_service ON venue_health_weights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY health_rules_service ON venue_health_trigger_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY health_thresholds_service ON venue_health_thresholds FOR ALL USING (true) WITH CHECK (true);

-- Authenticated: read access scoped to org venues
CREATE POLICY health_daily_read ON venue_health_daily
  FOR SELECT TO authenticated
  USING (venue_id IN (
    SELECT v.id FROM venues v
    JOIN organization_users ou ON ou.organization_id = v.organization_id
    WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
  ));

CREATE POLICY health_signals_read ON venue_health_signals_daily
  FOR SELECT TO authenticated
  USING (venue_id IN (
    SELECT v.id FROM venues v
    JOIN organization_users ou ON ou.organization_id = v.organization_id
    WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
  ));

CREATE POLICY health_actions_read ON venue_health_actions
  FOR SELECT TO authenticated
  USING (venue_id IN (
    SELECT v.id FROM venues v
    JOIN organization_users ou ON ou.organization_id = v.organization_id
    WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
  ));

-- Config tables: read-only for all authenticated users
CREATE POLICY health_weights_read ON venue_health_weights FOR SELECT TO authenticated USING (true);
CREATE POLICY health_rules_read ON venue_health_trigger_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY health_thresholds_read ON venue_health_thresholds FOR SELECT TO authenticated USING (true);


-- ============================================================================
-- PART 9: VIEWS
-- ============================================================================

-- Current health snapshot across all venues
CREATE OR REPLACE VIEW v_venue_health_current AS
SELECT
  v.name AS venue_name,
  h.venue_id,
  h.date,
  h.health_score,
  h.status,
  h.confidence,
  h.signal_count,
  h.top_drivers,
  (SELECT COUNT(*) FROM venue_health_actions a
   WHERE a.venue_id = h.venue_id AND a.date = h.date AND a.completed_at IS NULL
  ) AS open_actions
FROM venue_health_daily h
JOIN venues v ON v.id = h.venue_id
WHERE h.date = (SELECT MAX(date) FROM venue_health_daily WHERE venue_id = h.venue_id);

-- 7-day health trend per venue
CREATE OR REPLACE VIEW v_venue_health_trend_7d AS
SELECT
  v.name AS venue_name,
  h.venue_id,
  h.date,
  h.health_score,
  h.status,
  AVG(h.health_score) OVER (
    PARTITION BY h.venue_id ORDER BY h.date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS rolling_7d_avg
FROM venue_health_daily h
JOIN venues v ON v.id = h.venue_id
WHERE h.date >= CURRENT_DATE - 30
ORDER BY v.name, h.date DESC;

-- Open actions needing attention
CREATE OR REPLACE VIEW v_health_actions_open AS
SELECT
  v.name AS venue_name,
  a.venue_id,
  a.date,
  a.health_score,
  a.status,
  a.action_type,
  a.action_detail,
  a.created_at,
  EXTRACT(EPOCH FROM (now() - a.created_at)) / 3600 AS hours_open
FROM venue_health_actions a
JOIN venues v ON v.id = a.venue_id
WHERE a.completed_at IS NULL
ORDER BY a.status DESC, a.created_at ASC;
