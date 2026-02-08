-- Migration 202: Seed Labor Optimization Initial Data
-- Purpose: Populate service quality standards and optimization settings
-- Date: 2026-02-05

-- =====================================================
-- SEED SERVICE QUALITY STANDARDS
-- =====================================================

-- Insert fine dining service quality standards for all venues
-- These can be customized per venue later

INSERT INTO service_quality_standards (
  venue_id,
  service_tier,
  max_tables_per_server,
  max_covers_per_server,
  min_busser_to_server_ratio,
  min_runner_to_server_ratio,
  min_sommelier_covers_threshold,
  shift_type,
  quality_priority_weight,
  min_service_quality_score,
  effective_from,
  is_active
)
SELECT
  v.id as venue_id,
  'fine_dining' as service_tier,
  3.5 as max_tables_per_server,
  12.0 as max_covers_per_server,
  0.5 as min_busser_to_server_ratio,
  0.33 as min_runner_to_server_ratio,
  40 as min_sommelier_covers_threshold,
  NULL as shift_type,  -- Applies to all shifts
  0.7 as quality_priority_weight,
  0.85 as min_service_quality_score,
  CURRENT_DATE as effective_from,
  TRUE as is_active
FROM venues v
WHERE NOT EXISTS (
  SELECT 1 FROM service_quality_standards sqs
  WHERE sqs.venue_id = v.id AND sqs.is_active = TRUE
);

-- Insert shift-specific overrides for dinner (higher quality standards)
INSERT INTO service_quality_standards (
  venue_id,
  service_tier,
  max_tables_per_server,
  max_covers_per_server,
  min_busser_to_server_ratio,
  min_runner_to_server_ratio,
  min_sommelier_covers_threshold,
  shift_type,
  quality_priority_weight,
  min_service_quality_score,
  effective_from,
  is_active
)
SELECT
  v.id as venue_id,
  'fine_dining' as service_tier,
  3.0 as max_tables_per_server,      -- Stricter for dinner
  10.0 as max_covers_per_server,     -- Stricter for dinner
  0.6 as min_busser_to_server_ratio, -- More support for dinner
  0.4 as min_runner_to_server_ratio, -- More runners for dinner
  30 as min_sommelier_covers_threshold,  -- Lower threshold for dinner
  'dinner' as shift_type,
  0.8 as quality_priority_weight,    -- Higher quality priority for dinner
  0.90 as min_service_quality_score, -- Higher quality bar for dinner
  CURRENT_DATE as effective_from,
  TRUE as is_active
FROM venues v
WHERE NOT EXISTS (
  SELECT 1 FROM service_quality_standards sqs
  WHERE sqs.venue_id = v.id AND sqs.shift_type = 'dinner' AND sqs.is_active = TRUE
);

COMMENT ON TABLE service_quality_standards IS 'Seeded with fine dining standards: max 12 covers/server (10 for dinner), min 0.5 busser ratio';

-- =====================================================
-- SEED LABOR OPTIMIZATION SETTINGS
-- =====================================================

-- Insert balanced optimization settings for all venues
INSERT INTO labor_optimization_settings (
  venue_id,
  optimization_mode,
  cost_weight,
  quality_weight,
  efficiency_weight,
  target_labor_percentage,
  max_labor_percentage,
  min_labor_percentage,
  monthly_margin_improvement_target,
  require_manager_approval,
  auto_optimize_threshold,
  is_active
)
SELECT
  v.id as venue_id,
  'balanced' as optimization_mode,
  0.40 as cost_weight,
  0.40 as quality_weight,
  0.20 as efficiency_weight,
  27.5 as target_labor_percentage,
  30.0 as max_labor_percentage,
  25.0 as min_labor_percentage,
  0.5 as monthly_margin_improvement_target,
  TRUE as require_manager_approval,
  5.0 as auto_optimize_threshold,
  TRUE as is_active
FROM venues v
WHERE NOT EXISTS (
  SELECT 1 FROM labor_optimization_settings los
  WHERE los.venue_id = v.id
);

COMMENT ON TABLE labor_optimization_settings IS 'Seeded with balanced optimization (40% cost, 40% quality, 20% efficiency), manager approval required';

-- =====================================================
-- INSTRUCTIONS FOR RUNNING CPLH ANALYZER
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===================================================================';
  RAISE NOTICE 'LABOR OPTIMIZATION SETUP COMPLETE';
  RAISE NOTICE '===================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '';
  RAISE NOTICE '1. REFRESH MATERIALIZED VIEWS:';
  RAISE NOTICE '   SELECT refresh_labor_optimization_views();';
  RAISE NOTICE '';
  RAISE NOTICE '2. RUN CPLH ANALYZER (Python):';
  RAISE NOTICE '   cd python-services/labor_analyzer';
  RAISE NOTICE '   python cplh_analyzer.py <venue_id> --days 180';
  RAISE NOTICE '';
  RAISE NOTICE '   This will:';
  RAISE NOTICE '   - Analyze last 180 days of shift data';
  RAISE NOTICE '   - Calculate CPLH percentiles by position/shift/day';
  RAISE NOTICE '   - Compare to industry benchmarks';
  RAISE NOTICE '   - Populate covers_per_labor_hour_targets table';
  RAISE NOTICE '';
  RAISE NOTICE '3. VERIFY TARGETS:';
  RAISE NOTICE '   SELECT position_name, shift_type, day_of_week,';
  RAISE NOTICE '          min_cplh, target_cplh, optimal_cplh, max_cplh, source';
  RAISE NOTICE '   FROM covers_per_labor_hour_targets';
  RAISE NOTICE '   JOIN positions ON position_id = positions.id';
  RAISE NOTICE '   WHERE venue_id = ''<venue_id>'' AND is_active = TRUE;';
  RAISE NOTICE '';
  RAISE NOTICE '4. REVIEW SETTINGS:';
  RAISE NOTICE '   SELECT * FROM labor_optimization_settings WHERE venue_id = ''<venue_id>'';';
  RAISE NOTICE '   SELECT * FROM service_quality_standards WHERE venue_id = ''<venue_id>'';';
  RAISE NOTICE '';
  RAISE NOTICE '===================================================================';
  RAISE NOTICE '';
END $$;
