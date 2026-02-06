-- ============================================================================
-- CRON: Weekly bias decay + daily override outcome recording
-- ============================================================================

-- Job 7: Decay bias offsets weekly (Sunday 5am, after alert cleanup)
SELECT cron.schedule(
  'decay-bias-offsets-weekly',
  '0 5 * * 0', -- Every Sunday at 5am
  $$SELECT * FROM decay_bias_offsets()$$
);

-- Job 8: Record override outcomes daily (backfill actuals for yesterday's overrides)
-- Fills in actual_covers, error_model, error_override for completed dates
SELECT cron.schedule(
  'record-override-outcomes-daily',
  '30 6 * * *', -- Every day at 6:30am (after venue_day_facts are populated)
  $$
    UPDATE forecast_overrides fo
    SET
      actual_covers = vdf.covers_count,
      error_model = vdf.covers_count - fo.forecast_pre_override,
      error_override = vdf.covers_count - fo.forecast_post_override,
      outcome_recorded_at = now()
    FROM venue_day_facts vdf
    WHERE vdf.venue_id = fo.venue_id
      AND vdf.business_date = fo.business_date
      AND fo.actual_covers IS NULL
      AND fo.business_date < CURRENT_DATE
      AND vdf.covers_count > 0
  $$
);

-- Job 9: Refresh pacing baselines weekly (Sunday 5:30am)
SELECT cron.schedule(
  'refresh-pacing-baselines-weekly',
  '30 5 * * 0', -- Every Sunday at 5:30am
  $$SELECT * FROM refresh_pacing_baselines(90)$$
);

SELECT 'Cron jobs added: decay-bias-offsets-weekly, record-override-outcomes-daily, refresh-pacing-baselines-weekly' as status;
