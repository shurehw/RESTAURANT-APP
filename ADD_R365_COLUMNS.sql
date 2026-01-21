-- Run this in Supabase SQL Editor FIRST before running the migration
-- This adds R365 fields to the items table for round-trip compatibility

ALTER TABLE items ADD COLUMN IF NOT EXISTS r365_measure_type TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS r365_reporting_uom TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS r365_inventory_uom TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS r365_cost_account TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS r365_inventory_account TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS r365_cost_update_method TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS r365_key_item BOOLEAN DEFAULT false;

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'items' AND column_name LIKE 'r365%'
ORDER BY column_name;
