-- Add item_type column to items table to distinguish Beverage vs Food
ALTER TABLE items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'beverage';

-- Create index for filtering by item_type
CREATE INDEX IF NOT EXISTS idx_items_item_type ON items(item_type);

-- Add check constraint to ensure valid values
ALTER TABLE items ADD CONSTRAINT check_item_type CHECK (item_type IN ('beverage', 'food', 'other'));

-- Tag all current items as 'beverage' (since we only imported beverage items so far)
UPDATE items SET item_type = 'beverage' WHERE item_type IS NULL;
