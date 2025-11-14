/**
 * Migration 045: Monthly/Annual Savings Tracking
 * Purpose: Track cost savings from inventory management (par optimization, waste reduction)
 * Based on: Over-ordering prevention, spoilage reduction, better purchasing
 */

-- Savings Events: Track individual savings opportunities
CREATE TABLE IF NOT EXISTS savings_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  savings_type TEXT NOT NULL CHECK (savings_type IN (
    'par_optimization',      -- Avoided over-ordering by maintaining par
    'waste_reduction',       -- Reduced spoilage/waste
    'price_negotiation',     -- Better vendor pricing
    'portion_control',       -- Recipe standardization savings
    'theft_prevention'       -- Inventory shrinkage reduction
  )),
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  savings_amount NUMERIC(10,2) NOT NULL CHECK (savings_amount >= 0),
  baseline_cost NUMERIC(10,2), -- What it would have cost without optimization
  actual_cost NUMERIC(10,2),   -- What it actually cost
  quantity NUMERIC(12,3),       -- Quantity involved
  metadata JSONB,               -- Additional context
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_savings_events_venue ON savings_events(venue_id);
CREATE INDEX idx_savings_events_date ON savings_events(event_date DESC);
CREATE INDEX idx_savings_events_type ON savings_events(savings_type);
CREATE INDEX idx_savings_events_item ON savings_events(item_id);

-- Monthly Savings Summary (Materialized View)
CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_savings_summary AS
SELECT
  venue_id,
  DATE_TRUNC('month', event_date)::DATE as month_start,
  savings_type,
  COUNT(*) as event_count,
  SUM(savings_amount) as total_savings,
  AVG(savings_amount) as avg_savings,
  SUM(baseline_cost) as total_baseline_cost,
  SUM(actual_cost) as total_actual_cost,
  CASE
    WHEN SUM(baseline_cost) > 0 THEN
      ((SUM(baseline_cost) - SUM(actual_cost)) / SUM(baseline_cost)) * 100
    ELSE 0
  END as savings_pct
FROM savings_events
GROUP BY venue_id, DATE_TRUNC('month', event_date), savings_type;

CREATE UNIQUE INDEX idx_monthly_savings_unique
  ON monthly_savings_summary(venue_id, month_start, savings_type);

CREATE INDEX idx_monthly_savings_venue ON monthly_savings_summary(venue_id);
CREATE INDEX idx_monthly_savings_month ON monthly_savings_summary(month_start DESC);

-- Annual Savings Summary (View)
CREATE OR REPLACE VIEW annual_savings_summary AS
SELECT
  venue_id,
  EXTRACT(YEAR FROM event_date)::INTEGER as year,
  savings_type,
  COUNT(*) as event_count,
  SUM(savings_amount) as total_savings,
  AVG(savings_amount) as avg_savings,
  SUM(baseline_cost) as total_baseline_cost,
  SUM(actual_cost) as total_actual_cost,
  CASE
    WHEN SUM(baseline_cost) > 0 THEN
      ((SUM(baseline_cost) - SUM(actual_cost)) / SUM(baseline_cost)) * 100
    ELSE 0
  END as savings_pct
FROM savings_events
GROUP BY venue_id, EXTRACT(YEAR FROM event_date), savings_type;

-- Function: Calculate par-based savings
-- Compares actual inventory levels to par and calculates avoided over-ordering costs
CREATE OR REPLACE FUNCTION calculate_par_savings(
  p_venue_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  times_at_par INTEGER,
  times_over_par INTEGER,
  avg_excess_qty NUMERIC,
  estimated_savings NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id as item_id,
    i.item_name,
    COUNT(*) FILTER (WHERE ic.on_hand_qty <= i.par_level) as times_at_par,
    COUNT(*) FILTER (WHERE ic.on_hand_qty > i.par_level) as times_over_par,
    AVG(GREATEST(ic.on_hand_qty - i.par_level, 0)) as avg_excess_qty,
    -- Estimate savings: excess quantity × unit cost × spoilage rate (assume 10%)
    SUM(GREATEST(ic.on_hand_qty - i.par_level, 0) * i.unit_cost * 0.10) as estimated_savings
  FROM items i
  LEFT JOIN inventory_counts ic ON ic.item_id = i.id
  WHERE i.venue_id = p_venue_id
    AND ic.count_date BETWEEN p_start_date AND p_end_date
    AND i.par_level IS NOT NULL
    AND i.par_level > 0
  GROUP BY i.id, i.item_name
  HAVING COUNT(*) > 0
  ORDER BY estimated_savings DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Function: Record par optimization savings
CREATE OR REPLACE FUNCTION record_par_savings(
  p_venue_id UUID,
  p_item_id UUID,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC,
  p_description TEXT
)
RETURNS UUID AS $$
DECLARE
  v_savings_amount NUMERIC;
  v_savings_id UUID;
BEGIN
  -- Calculate savings (assume 10% spoilage on excess)
  v_savings_amount := p_quantity * p_unit_cost * 0.10;

  INSERT INTO savings_events (
    venue_id,
    savings_type,
    item_id,
    description,
    savings_amount,
    baseline_cost,
    actual_cost,
    quantity
  ) VALUES (
    p_venue_id,
    'par_optimization',
    p_item_id,
    p_description,
    v_savings_amount,
    p_quantity * p_unit_cost, -- Would have bought this much
    0, -- Didn't buy it
    p_quantity
  )
  RETURNING id INTO v_savings_id;

  RETURN v_savings_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Refresh monthly savings summary
CREATE OR REPLACE FUNCTION refresh_monthly_savings()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_savings_summary;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE savings_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY savings_events_select ON savings_events FOR SELECT USING (true);
CREATE POLICY savings_events_all ON savings_events FOR ALL USING (true);

COMMENT ON TABLE savings_events IS 'Track cost savings from inventory optimization and waste reduction';
COMMENT ON MATERIALIZED VIEW monthly_savings_summary IS 'Monthly rollup of savings by venue and type';
COMMENT ON VIEW annual_savings_summary IS 'Annual rollup of savings by venue and type';
COMMENT ON FUNCTION calculate_par_savings IS 'Calculate potential savings from maintaining par levels';
COMMENT ON FUNCTION record_par_savings IS 'Record a par optimization savings event';
COMMENT ON FUNCTION refresh_monthly_savings IS 'Refresh the monthly savings materialized view';
