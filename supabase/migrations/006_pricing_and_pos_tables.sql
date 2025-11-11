-- ============================================================================
-- Add Menu Pricing and POS Integration - Tables Only
-- ============================================================================

-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS pos_sales CASCADE;
DROP TABLE IF EXISTS pos_items CASCADE;

-- 1. Add menu pricing to recipes
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS menu_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS pos_sku TEXT,
ADD COLUMN IF NOT EXISTS food_cost_target NUMERIC(5,2) DEFAULT 30.00;

COMMENT ON COLUMN recipes.menu_price IS 'Menu price for menu_item type recipes';
COMMENT ON COLUMN recipes.pos_sku IS 'POS system SKU/PLU for sales mapping';
COMMENT ON COLUMN recipes.food_cost_target IS 'Target food cost % (e.g., 30.00 for 30%)';

CREATE INDEX IF NOT EXISTS idx_recipes_pos_sku ON recipes(pos_sku) WHERE pos_sku IS NOT NULL;

-- 2. Create POS sales import table (daily sales data)
CREATE TABLE pos_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  pos_sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  gross_sales NUMERIC(12,2) NOT NULL,
  net_sales NUMERIC(12,2) NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  imported_by UUID REFERENCES users(id),

  CONSTRAINT uq_pos_sale UNIQUE(venue_id, sale_date, pos_sku)
);

COMMENT ON TABLE pos_sales IS 'Daily POS sales data for theoretical vs actual analysis';

CREATE INDEX IF NOT EXISTS idx_pos_sales_date ON pos_sales(venue_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_sku ON pos_sales(venue_id, pos_sku, sale_date);

-- 3. Create POS items master table (import from POS system)
CREATE TABLE pos_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  pos_sku TEXT NOT NULL,
  pos_name TEXT NOT NULL,
  pos_category TEXT,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  is_mapped BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_pos_item_sku UNIQUE(venue_id, pos_sku)
);

COMMENT ON TABLE pos_items IS 'POS menu items for mapping to recipes';
COMMENT ON COLUMN pos_items.recipe_id IS 'Mapped OpsOS recipe for theoretical calculations';
COMMENT ON COLUMN pos_items.is_mapped IS 'Whether this POS item has been mapped to a recipe';

CREATE INDEX IF NOT EXISTS idx_pos_items_venue ON pos_items(venue_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pos_items_unmapped ON pos_items(venue_id) WHERE is_mapped = false;

-- 4. Enable RLS on new tables
ALTER TABLE pos_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_items_select ON pos_items FOR SELECT USING (true);
CREATE POLICY pos_items_all ON pos_items FOR ALL USING (true);
CREATE POLICY pos_sales_select ON pos_sales FOR SELECT USING (true);
CREATE POLICY pos_sales_all ON pos_sales FOR ALL USING (true);
