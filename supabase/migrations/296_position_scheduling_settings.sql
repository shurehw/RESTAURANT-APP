-- ============================================================================
-- Per-Position Scheduling Settings
--
-- Adds opener/closer minimums, setup/breakdown time, and support ratio
-- to schedule_position_overrides. These drive the covers-based scheduler:
--   - min_openers / min_closers: floor for setup and breakdown crew
--   - setup_minutes / breakdown_minutes: time before open / after close
--   - support_ratio: for support positions (busser, food runner) — how many
--     per lead position (e.g. 0.5 = 1 busser per 2 servers)
-- ============================================================================

ALTER TABLE schedule_position_overrides
  ADD COLUMN IF NOT EXISTS min_openers INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_closers INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS setup_minutes INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS breakdown_minutes INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS support_ratio NUMERIC(4,2) DEFAULT NULL;

COMMENT ON COLUMN schedule_position_overrides.min_openers IS
  'Minimum staff for opening shift (setup crew), regardless of demand';
COMMENT ON COLUMN schedule_position_overrides.min_closers IS
  'Minimum staff for closing shift (breakdown crew), regardless of demand';
COMMENT ON COLUMN schedule_position_overrides.setup_minutes IS
  'Minutes before guest arrival for setup (sidework, pre-shift). Default 30.';
COMMENT ON COLUMN schedule_position_overrides.breakdown_minutes IS
  'Minutes after close for breakdown (cash out, clean, reset). Default 30.';
COMMENT ON COLUMN schedule_position_overrides.support_ratio IS
  'For support positions: ratio to lead position. E.g. 0.5 = 1 busser per 2 servers. NULL = use CPLH instead.';

SELECT 'Added scheduling settings to schedule_position_overrides' as status;
