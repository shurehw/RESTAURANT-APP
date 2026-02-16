-- ============================================================================
-- ADD LABOR + COMP DATA TO SALES SNAPSHOTS
-- Pre-compute labor and comp data during polling so dashboard reads are instant
-- (no live TipSee queries needed for Pulse enrichment)
-- ============================================================================

-- Labor fields
ALTER TABLE sales_snapshots
  ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_hours NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_employee_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_ot_hours NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_foh_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_boh_cost NUMERIC(14,2) DEFAULT 0;

-- Comp exception fields (comps_total already exists as raw amount)
ALTER TABLE sales_snapshots
  ADD COLUMN IF NOT EXISTS comp_exception_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comp_critical_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comp_warning_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comp_top_exceptions JSONB DEFAULT '[]'::jsonb;
