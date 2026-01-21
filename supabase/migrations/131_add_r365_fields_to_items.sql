-- Add R365 integration fields to items table
-- These fields store R365-specific data for round-trip compatibility

ALTER TABLE items
ADD COLUMN IF NOT EXISTS r365_measure_type TEXT,
ADD COLUMN IF NOT EXISTS r365_reporting_uom TEXT,
ADD COLUMN IF NOT EXISTS r365_inventory_uom TEXT,
ADD COLUMN IF NOT EXISTS r365_cost_account TEXT,
ADD COLUMN IF NOT EXISTS r365_inventory_account TEXT,
ADD COLUMN IF NOT EXISTS r365_cost_update_method TEXT,
ADD COLUMN IF NOT EXISTS r365_key_item BOOLEAN DEFAULT false;

COMMENT ON COLUMN items.r365_measure_type IS 'R365 Measure Type (Volume, Weight, etc.)';
COMMENT ON COLUMN items.r365_reporting_uom IS 'R365 Reporting Unit of Measure';
COMMENT ON COLUMN items.r365_inventory_uom IS 'R365 Inventory Unit of Measure';
COMMENT ON COLUMN items.r365_cost_account IS 'R365 Cost Account name';
COMMENT ON COLUMN items.r365_inventory_account IS 'R365 Inventory Account name';
COMMENT ON COLUMN items.r365_cost_update_method IS 'R365 Cost Update Method (LastReceipt, Average, etc.)';
COMMENT ON COLUMN items.r365_key_item IS 'R365 Key Item flag';
