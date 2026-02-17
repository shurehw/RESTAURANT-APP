-- Add "Other" labor columns to sales_snapshots
-- Previously only FOH + BOH were stored; Other (Door, Security, VIP Host, etc.) was lost

ALTER TABLE sales_snapshots
  ADD COLUMN IF NOT EXISTS labor_other_cost NUMERIC(14,2) DEFAULT 0;
