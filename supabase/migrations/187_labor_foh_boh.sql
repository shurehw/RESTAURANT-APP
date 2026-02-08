-- Add FOH/BOH breakdown columns to labor_day_facts
-- Department classification from 7Shifts departments table:
--   FOH = "FOH", BOH = "BOH", Other = Door Coordinator, General, Security, VIP Host

ALTER TABLE labor_day_facts
  ADD COLUMN IF NOT EXISTS foh_hours NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS foh_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS foh_employee_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boh_hours NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boh_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boh_employee_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_hours NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_employee_count INTEGER DEFAULT 0;

SELECT 'labor_day_facts FOH/BOH columns added' as status;
