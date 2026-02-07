-- ============================================================================
-- FIX: venue_class weight lookup fallback + seed all venue classes
-- Problem: venues with class high_end_social/nightclub/member_club found no
--          weights (only 'default' existed), so signal_count=0 → false RED.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Seed weights for each venue_class (same as default for now — tunable)
-- ---------------------------------------------------------------------------
INSERT INTO venue_health_weights (venue_class, signal, weight) VALUES
  -- high_end_social (Delilah LA, Delilah Miami, Nice Guy)
  ('high_end_social', 'reviews',   0.150),
  ('high_end_social', 'sales',     0.200),
  ('high_end_social', 'labor',     0.200),
  ('high_end_social', 'leakage',   0.200),
  ('high_end_social', 'flow',      0.150),
  ('high_end_social', 'integrity', 0.100),

  -- nightclub (Keys, Poppy)
  ('nightclub', 'reviews',   0.150),
  ('nightclub', 'sales',     0.200),
  ('nightclub', 'labor',     0.200),
  ('nightclub', 'leakage',   0.200),
  ('nightclub', 'flow',      0.150),
  ('nightclub', 'integrity', 0.100),

  -- member_club (Bird Streets)
  ('member_club', 'reviews',   0.150),
  ('member_club', 'sales',     0.200),
  ('member_club', 'labor',     0.200),
  ('member_club', 'leakage',   0.200),
  ('member_club', 'flow',      0.150),
  ('member_club', 'integrity', 0.100)
ON CONFLICT (venue_class, signal) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Fix compute_venue_health: fall back to 'default' if no class weights
-- ---------------------------------------------------------------------------
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
  v_effective_class text;
BEGIN

  -- Fall back to 'default' if no weights exist for this venue class
  SELECT venue_class INTO v_effective_class
  FROM venue_health_weights
  WHERE venue_class = p_venue_class AND enabled = true
  LIMIT 1;

  IF v_effective_class IS NULL THEN
    v_effective_class := 'default';
  END IF;

  -- Loop through enabled signals and their weights
  FOR v_signal IN
    SELECT signal, weight
    FROM venue_health_weights
    WHERE venue_class = v_effective_class AND enabled = true
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

-- ---------------------------------------------------------------------------
-- 3. Clean up false RED data from initial test run
-- ---------------------------------------------------------------------------
DELETE FROM venue_health_actions WHERE date = CURRENT_DATE;
DELETE FROM venue_health_signals_daily WHERE date = CURRENT_DATE;
DELETE FROM venue_health_daily WHERE date = CURRENT_DATE;
