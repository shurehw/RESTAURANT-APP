-- ============================================================================
-- Add Sub-Recipe Support
-- Allow recipes to contain other recipes (e.g., sauce as component)
-- ============================================================================

-- Add recipe_type to classify recipes
CREATE TYPE recipe_type AS ENUM ('prepared_item', 'menu_item');

ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS recipe_type recipe_type DEFAULT 'prepared_item',
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(10,4); -- cached calculated cost

COMMENT ON COLUMN recipes.recipe_type IS 'Type: prepared_item (sub-recipe) or menu_item (final dish)';
COMMENT ON COLUMN recipes.category IS 'Category: sauce, protein, side, garnish, etc.';
COMMENT ON COLUMN recipes.cost_per_unit IS 'Cached total cost per yield unit (recalculated on ingredient price changes)';

-- Add sub_recipe_id to recipe_items to support nested recipes
ALTER TABLE recipe_items
ADD COLUMN IF NOT EXISTS sub_recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE;

-- Add constraint: must have either item_id OR sub_recipe_id (not both)
ALTER TABLE recipe_items
DROP CONSTRAINT IF EXISTS ri_item_or_subrecipe,
ADD CONSTRAINT ri_item_or_subrecipe CHECK (
  (item_id IS NOT NULL AND sub_recipe_id IS NULL) OR
  (item_id IS NULL AND sub_recipe_id IS NOT NULL)
);

-- Make item_id nullable since we can now have sub_recipe_id instead
ALTER TABLE recipe_items
ALTER COLUMN item_id DROP NOT NULL;

-- Index for sub-recipe lookups
CREATE INDEX IF NOT EXISTS idx_ri_sub_recipe ON recipe_items(sub_recipe_id) WHERE sub_recipe_id IS NOT NULL;

COMMENT ON COLUMN recipe_items.sub_recipe_id IS 'Reference to another recipe (for sub-recipes like sauces)';
COMMENT ON TABLE recipe_items IS 'BOM lines: can reference raw items OR sub-recipes (nested)';

-- Create view for flat recipe costs (with nested sub-recipe expansion)
CREATE OR REPLACE VIEW v_recipe_costs AS
WITH RECURSIVE recipe_explosion AS (
  -- Base case: direct ingredients
  SELECT
    ri.recipe_id,
    ri.item_id,
    ri.qty::NUMERIC, -- cast to NUMERIC to match recursive term
    ri.uom,
    ri.sub_recipe_id,
    1 as level,
    ARRAY[ri.recipe_id] as path
  FROM recipe_items ri

  UNION ALL

  -- Recursive case: expand sub-recipes
  SELECT
    re.recipe_id,
    ri.item_id,
    (re.qty * ri.qty)::NUMERIC as qty, -- multiply quantities and cast
    ri.uom,
    ri.sub_recipe_id,
    re.level + 1,
    re.path || ri.recipe_id
  FROM recipe_explosion re
  JOIN recipe_items ri ON re.sub_recipe_id = ri.recipe_id
  WHERE NOT (ri.recipe_id = ANY(re.path)) -- prevent circular references
)
SELECT
  re.recipe_id,
  re.item_id,
  i.name as item_name,
  i.sku,
  SUM(re.qty) as total_qty,
  re.uom,
  ich.unit_cost,
  SUM(re.qty * COALESCE(ich.unit_cost, 0)) as line_cost
FROM recipe_explosion re
LEFT JOIN items i ON re.item_id = i.id
LEFT JOIN LATERAL (
  SELECT unit_cost
  FROM item_cost_history
  WHERE item_id = re.item_id
  ORDER BY effective_date DESC
  LIMIT 1
) ich ON true
WHERE re.item_id IS NOT NULL -- only leaf nodes (actual items)
GROUP BY re.recipe_id, re.item_id, i.name, i.sku, re.uom, ich.unit_cost;

COMMENT ON VIEW v_recipe_costs IS 'Flattened recipe costs with sub-recipes recursively expanded';
