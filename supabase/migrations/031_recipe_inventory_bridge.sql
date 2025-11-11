/**
 * Migration 031: Recipe-Inventory Bridge
 * Purpose: Link recipes to inventory items for COGS calculation
 * Tables: recipe_components, recipe_costs
 */

-- Recipe Components: Links recipes to inventory items with quantities
CREATE TABLE IF NOT EXISTS recipe_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  cost_pct_of_dish NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipe_components_unique UNIQUE(recipe_id, item_id)
);

CREATE INDEX idx_recipe_components_recipe_id ON recipe_components(recipe_id);
CREATE INDEX idx_recipe_components_item_id ON recipe_components(item_id);

-- Recipe Costs: Snapshot of total recipe cost over time
CREATE TABLE IF NOT EXISTS recipe_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  total_cost NUMERIC(12,4) NOT NULL,
  cost_per_serving NUMERIC(12,4),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  component_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recipe_costs_recipe_id ON recipe_costs(recipe_id);
CREATE INDEX idx_recipe_costs_venue_id ON recipe_costs(venue_id);
CREATE INDEX idx_recipe_costs_calculated_at ON recipe_costs(calculated_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_recipe_components_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER recipe_components_updated_at
  BEFORE UPDATE ON recipe_components
  FOR EACH ROW
  EXECUTE FUNCTION update_recipe_components_updated_at();

-- Function to calculate and store recipe cost
CREATE OR REPLACE FUNCTION calculate_recipe_cost(
  p_recipe_id UUID,
  p_venue_id UUID DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_total_cost NUMERIC := 0;
  v_component_count INT := 0;
BEGIN
  -- Calculate total cost from inventory balances
  SELECT
    COALESCE(SUM(rc.quantity * COALESCE(ib.last_cost, 0)), 0),
    COUNT(*)
  INTO v_total_cost, v_component_count
  FROM recipe_components rc
  LEFT JOIN inventory_balances ib ON rc.item_id = ib.item_id
    AND (p_venue_id IS NULL OR ib.venue_id = p_venue_id)
  WHERE rc.recipe_id = p_recipe_id;

  -- Store snapshot
  INSERT INTO recipe_costs (
    recipe_id,
    venue_id,
    total_cost,
    component_count,
    calculated_at
  ) VALUES (
    p_recipe_id,
    p_venue_id,
    v_total_cost,
    v_component_count,
    NOW()
  );

  RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE recipe_components IS 'Links recipes to inventory items with quantities for COGS calculation';
COMMENT ON TABLE recipe_costs IS 'Historical snapshot of recipe costs over time';
COMMENT ON FUNCTION calculate_recipe_cost IS 'Calculate and store total cost for a recipe based on current inventory costs';
