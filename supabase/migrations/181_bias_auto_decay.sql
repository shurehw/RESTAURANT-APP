-- ============================================================================
-- BIAS AUTO-DECAY
-- Exponentially decays day_type offsets toward 0 over time
-- Holidays stay manual — only day_type offsets are decayed
-- Designed to run weekly via cron or Edge Function
-- ============================================================================

-- Decay configuration per venue
CREATE TABLE IF NOT EXISTS bias_decay_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Decay rate per cycle (0.10 = 10% decay per week)
  -- After 1 week: 90%, 4 weeks: 65%, 8 weeks: 43%
  decay_rate NUMERIC(4,3) NOT NULL DEFAULT 0.10,

  -- Don't decay if offset magnitude is below this (avoids noise)
  min_offset_threshold INTEGER NOT NULL DEFAULT 2,

  -- Stop decaying after this many cycles (safety net)
  max_decay_cycles INTEGER DEFAULT 12,

  -- Whether decay is active for this venue
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(venue_id)
);

-- Decay audit log
CREATE TABLE IF NOT EXISTS bias_decay_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  decay_cycle INTEGER NOT NULL,
  offsets_before JSONB NOT NULL,
  offsets_after JSONB NOT NULL,
  decay_rate NUMERIC(4,3) NOT NULL,
  decayed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for querying decay history
CREATE INDEX IF NOT EXISTS idx_bias_decay_log_venue
  ON bias_decay_log(venue_id, decayed_at DESC);

-- RLS
ALTER TABLE bias_decay_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE bias_decay_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view decay config for their venues"
  ON bias_decay_config FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

CREATE POLICY "Users can view decay logs for their venues"
  ON bias_decay_log FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      WHERE v.organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

-- ============================================================================
-- Main decay function
-- Call weekly: SELECT * FROM decay_bias_offsets();
-- ============================================================================
CREATE OR REPLACE FUNCTION decay_bias_offsets()
RETURNS TABLE(
  venue_name TEXT,
  offsets_before JSONB,
  offsets_after JSONB,
  decay_rate NUMERIC,
  cycle INTEGER
) AS $$
DECLARE
  rec RECORD;
  dt TEXT;
  old_val NUMERIC;
  new_val INTEGER;
  new_offsets JSONB;
  current_cycle INTEGER;
BEGIN
  FOR rec IN
    SELECT
      ba.id as bias_id,
      ba.venue_id,
      ba.day_type_offsets,
      dc.decay_rate as d_rate,
      dc.min_offset_threshold,
      dc.max_decay_cycles,
      v.name as v_name,
      -- Count how many times we've decayed this venue
      COALESCE(
        (SELECT MAX(dl.decay_cycle) FROM bias_decay_log dl WHERE dl.venue_id = ba.venue_id),
        0
      ) + 1 as next_cycle
    FROM forecast_bias_adjustments ba
    JOIN bias_decay_config dc ON dc.venue_id = ba.venue_id AND dc.is_active = TRUE
    JOIN venues v ON v.id = ba.venue_id
    WHERE ba.effective_to IS NULL
      AND ba.day_type_offsets IS NOT NULL
      AND ba.day_type_offsets != '{}'::jsonb
  LOOP
    -- Check max cycles
    IF rec.max_decay_cycles IS NOT NULL AND rec.next_cycle > rec.max_decay_cycles THEN
      CONTINUE;
    END IF;

    new_offsets := rec.day_type_offsets;
    current_cycle := rec.next_cycle;

    -- Decay each day_type offset
    FOR dt IN SELECT jsonb_object_keys(rec.day_type_offsets)
    LOOP
      -- Skip holiday offsets (holidays are manual)
      IF dt = 'holiday' THEN
        CONTINUE;
      END IF;

      old_val := (rec.day_type_offsets->>dt)::NUMERIC;

      -- Skip if already at or below threshold
      IF ABS(old_val) <= rec.min_offset_threshold THEN
        new_offsets := jsonb_set(new_offsets, ARRAY[dt], '0'::jsonb);
        CONTINUE;
      END IF;

      -- Apply exponential decay: new = old * (1 - decay_rate)
      new_val := ROUND(old_val * (1.0 - rec.d_rate));

      -- Snap to 0 if below threshold after decay
      IF ABS(new_val) <= rec.min_offset_threshold THEN
        new_val := 0;
      END IF;

      new_offsets := jsonb_set(new_offsets, ARRAY[dt], to_jsonb(new_val));
    END LOOP;

    -- Update the bias adjustments
    UPDATE forecast_bias_adjustments
    SET day_type_offsets = new_offsets
    WHERE id = rec.bias_id;

    -- Log the decay
    INSERT INTO bias_decay_log (venue_id, decay_cycle, offsets_before, offsets_after, decay_rate)
    VALUES (rec.venue_id, current_cycle, rec.day_type_offsets, new_offsets, rec.d_rate);

    -- Return result
    venue_name := rec.v_name;
    offsets_before := rec.day_type_offsets;
    offsets_after := new_offsets;
    decay_rate := rec.d_rate;
    cycle := current_cycle;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Seed default decay config for all venues with bias adjustments
-- 10% weekly decay, min threshold 2, max 12 cycles (3 months)
-- ============================================================================
INSERT INTO bias_decay_config (venue_id, decay_rate, min_offset_threshold, max_decay_cycles)
SELECT ba.venue_id, 0.10, 2, 12
FROM forecast_bias_adjustments ba
WHERE ba.effective_to IS NULL
ON CONFLICT (venue_id) DO NOTHING;

-- Grant access
GRANT SELECT ON bias_decay_config TO authenticated;
GRANT SELECT ON bias_decay_log TO authenticated;

SELECT 'Bias auto-decay created. Run SELECT * FROM decay_bias_offsets(); weekly.' as status;
