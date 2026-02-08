-- ============================================================================
-- FIX: format() specifiers — PG only supports %s, %I, %L (not %.2f)
-- This caused compute_review_risk and compute_leakage_risk to error silently.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fix compute_review_risk: %.2f → %s with ROUND()
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
-- 2. Fix compute_leakage_risk: %.1f / %.2f → %s with ROUND()
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

-- ---------------------------------------------------------------------------
-- 3. Clean up stale test data so we get fresh results
-- ---------------------------------------------------------------------------
DELETE FROM venue_health_actions;
DELETE FROM venue_health_signals_daily;
DELETE FROM venue_health_daily;
