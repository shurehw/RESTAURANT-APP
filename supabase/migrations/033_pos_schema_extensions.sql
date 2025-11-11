/**
 * Migration 033: POS Schema Extensions
 * Purpose: Add recipe_id and cogs to pos_sales for COGS tracking
 */

-- Add recipe_id to link sales to recipes for inventory deduction
ALTER TABLE pos_sales
ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;

-- Add cogs to track cost of goods sold per sale
ALTER TABLE pos_sales
ADD COLUMN IF NOT EXISTS cogs NUMERIC(12,4);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_pos_sales_recipe_id ON pos_sales(recipe_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_venue_date ON pos_sales(venue_id, sale_timestamp::DATE);

-- Add comment explaining the columns
COMMENT ON COLUMN pos_sales.recipe_id IS 'Links sale to recipe for inventory deduction and COGS calculation';
COMMENT ON COLUMN pos_sales.cogs IS 'Cost of goods sold calculated from recipe components';
