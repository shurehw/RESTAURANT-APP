/**
 * Migration 043: Row Level Security (RLS) Policies
 * Purpose: Add RLS policies for all new intelligence layer tables
 */

-- Enable RLS on new tables
ALTER TABLE recipe_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_pars ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE exception_rules ENABLE ROW LEVEL SECURITY;

-- Recipe Components Policies
CREATE POLICY "Users can view recipe_components for their organization"
  ON recipe_components FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      JOIN venues v ON r.venue_id = v.id
      JOIN user_venues uv ON v.id = uv.venue_id
      WHERE r.id = recipe_components.recipe_id
        AND uv.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage recipe_components for their organization"
  ON recipe_components FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      JOIN venues v ON r.venue_id = v.id
      JOIN user_venues uv ON v.id = uv.venue_id
      WHERE r.id = recipe_components.recipe_id
        AND uv.user_id = auth.uid()
        AND uv.role IN ('admin', 'manager')
    )
  );

-- Recipe Costs Policies
CREATE POLICY "Users can view recipe_costs for their organization"
  ON recipe_costs FOR SELECT
  USING (
    venue_id IS NULL OR
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.venue_id = recipe_costs.venue_id
        AND uv.user_id = auth.uid()
    )
  );

-- Daily Budgets Policies
CREATE POLICY "Users can view daily_budgets for their venues"
  ON daily_budgets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.venue_id = daily_budgets.venue_id
        AND uv.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage daily_budgets for their venues"
  ON daily_budgets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.venue_id = daily_budgets.venue_id
        AND uv.user_id = auth.uid()
        AND uv.role IN ('admin', 'manager')
    )
  );

-- Alert Rules Policies
CREATE POLICY "Users can view alert_rules"
  ON alert_rules FOR SELECT
  USING (true); -- All authenticated users can view rules

CREATE POLICY "Admins can manage alert_rules"
  ON alert_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.user_id = auth.uid()
        AND uv.role = 'admin'
    )
  );

-- Alerts Policies
CREATE POLICY "Users can view alerts for their venues"
  ON alerts FOR SELECT
  USING (
    venue_id IS NULL OR
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.venue_id = alerts.venue_id
        AND uv.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can acknowledge alerts for their venues"
  ON alerts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.venue_id = alerts.venue_id
        AND uv.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.venue_id = alerts.venue_id
        AND uv.user_id = auth.uid()
    )
  );

-- Item Pars Policies
CREATE POLICY "Users can view item_pars for their venues"
  ON item_pars FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.venue_id = item_pars.venue_id
        AND uv.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage item_pars for their venues"
  ON item_pars FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.venue_id = item_pars.venue_id
        AND uv.user_id = auth.uid()
        AND uv.role IN ('admin', 'manager')
    )
  );

-- Item Cost History Policies
CREATE POLICY "Users can view item_cost_history for their venues"
  ON item_cost_history FOR SELECT
  USING (
    venue_id IS NULL OR
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.venue_id = item_cost_history.venue_id
        AND uv.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert item_cost_history"
  ON item_cost_history FOR INSERT
  WITH CHECK (true); -- Triggers can insert

-- Exception Rules Policies
CREATE POLICY "Users can view exception_rules"
  ON exception_rules FOR SELECT
  USING (true); -- All authenticated users can view rules

CREATE POLICY "Admins can manage exception_rules"
  ON exception_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_venues uv
      WHERE uv.user_id = auth.uid()
        AND uv.role = 'admin'
    )
  );

-- Grant permissions to authenticated users
GRANT SELECT ON recipe_components TO authenticated;
GRANT SELECT ON recipe_costs TO authenticated;
GRANT SELECT ON daily_budgets TO authenticated;
GRANT SELECT ON alert_rules TO authenticated;
GRANT SELECT ON alerts TO authenticated;
GRANT SELECT ON item_pars TO authenticated;
GRANT SELECT ON item_cost_history TO authenticated;
GRANT SELECT ON exception_rules TO authenticated;

-- Grant usage on materialized views
GRANT SELECT ON labor_efficiency_hourly TO authenticated;
GRANT SELECT ON labor_efficiency_daily TO authenticated;
GRANT SELECT ON daily_performance TO authenticated;
GRANT SELECT ON vendor_performance TO authenticated;

-- Grant usage on regular views
GRANT SELECT ON items_below_reorder TO authenticated;
GRANT SELECT ON daily_variance TO authenticated;
GRANT SELECT ON operational_exceptions TO authenticated;
GRANT SELECT ON recent_performance TO authenticated;

COMMENT ON POLICY "Users can view recipe_components for their organization" ON recipe_components IS 'Users can view recipe components for recipes in their organization';
COMMENT ON POLICY "Users can manage recipe_components for their organization" ON recipe_components IS 'Admins and managers can create/update/delete recipe components';
COMMENT ON POLICY "Users can view alerts for their venues" ON alerts IS 'Users can view alerts for venues they have access to';
COMMENT ON POLICY "Users can acknowledge alerts for their venues" ON alerts IS 'Users can acknowledge/dismiss alerts for their venues';
