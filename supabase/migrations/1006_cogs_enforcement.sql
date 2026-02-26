/**
 * Migration 1006: COGS Enforcement Thresholds
 *
 * Adds configurable COGS variance thresholds and mapping coverage gate
 * to procurement_settings. Enables COGS violations to flow through the
 * existing enforcement engine (state machine, escalation, scoring).
 *
 * Previously hardcoded as 3pp critical / 1.5pp warning in the daily_variance
 * SQL view — now tunable per-org via P0-versioned settings.
 */

-- COGS variance thresholds (percentage points over budget)
ALTER TABLE procurement_settings
  ADD COLUMN IF NOT EXISTS cogs_variance_warning_pct NUMERIC(5,2) NOT NULL DEFAULT 1.50,
  ADD COLUMN IF NOT EXISTS cogs_variance_critical_pct NUMERIC(5,2) NOT NULL DEFAULT 3.00;

-- Mapping coverage gate: minimum sales coverage % before COGS enforcement fires
ALTER TABLE procurement_settings
  ADD COLUMN IF NOT EXISTS cogs_min_mapping_coverage_pct NUMERIC(5,2) NOT NULL DEFAULT 75.00;

-- Master switch for inventory exception enforcement (cost spikes, shrink, recipe drift, par)
ALTER TABLE procurement_settings
  ADD COLUMN IF NOT EXISTS inventory_exception_enforcement BOOLEAN NOT NULL DEFAULT TRUE;

-- Comments
COMMENT ON COLUMN procurement_settings.cogs_variance_warning_pct IS
  'PP over COGS budget that triggers a warning violation. Calibrated threshold, not optional.';
COMMENT ON COLUMN procurement_settings.cogs_variance_critical_pct IS
  'PP over COGS budget that triggers a critical violation. Calibrated threshold, not optional.';
COMMENT ON COLUMN procurement_settings.cogs_min_mapping_coverage_pct IS
  'Minimum menu item mapping sales coverage (%) required to trust COGS data for enforcement.';
COMMENT ON COLUMN procurement_settings.inventory_exception_enforcement IS
  'Master switch for inventory exception violations (cost spikes, shrink, recipe drift, par).';
