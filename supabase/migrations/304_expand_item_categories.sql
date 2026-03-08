-- Expand item_category enum to include more specific categories
-- This allows better categorization for GL mapping and reporting

-- Create the type if it doesn't exist (for databases that haven't run migration 001)
DO $$ BEGIN
  CREATE TYPE item_category AS ENUM ('food', 'beverage', 'packaging', 'supplies');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new category values to the enum
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'liquor';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'wine';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'beer';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'spirits';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'non_alcoholic_beverage';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'produce';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'meat';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'seafood';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'dairy';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'dry_goods';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'frozen';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'disposables';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'chemicals';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'smallwares';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'other';

COMMENT ON TYPE item_category IS 'Expanded item categories for better GL mapping and reporting. Maps to GL accounts for automatic coding.';

-- Add subcategory column for more granular classification
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS subcategory TEXT;

CREATE INDEX IF NOT EXISTS idx_items_category_subcategory
  ON items(category, subcategory)
  WHERE subcategory IS NOT NULL;

COMMENT ON COLUMN items.subcategory IS 'Subcategory for granular classification (e.g., Tequila, Vodka, Whiskey for liquor category)';
