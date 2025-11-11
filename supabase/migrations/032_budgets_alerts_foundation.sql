/**
 * Migration 032: Budgets & Alerts Foundation
 * Purpose: Daily budgets and alert system for variance detection
 * Tables: daily_budgets, alert_rules, alerts
 */

-- Daily Budgets: Target metrics for each venue by business date
CREATE TABLE IF NOT EXISTS daily_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  sales_budget NUMERIC(12,2) NOT NULL CHECK (sales_budget >= 0),
  labor_budget NUMERIC(12,2) NOT NULL CHECK (labor_budget >= 0),
  cogs_budget_pct NUMERIC(5,2) NOT NULL CHECK (cogs_budget_pct >= 0 AND cogs_budget_pct <= 100),
  prime_cost_budget_pct NUMERIC(5,2) NOT NULL CHECK (prime_cost_budget_pct >= 0 AND prime_cost_budget_pct <= 100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_budgets_unique UNIQUE(venue_id, business_date)
);

CREATE INDEX idx_daily_budgets_venue_date ON daily_budgets(venue_id, business_date DESC);
CREATE INDEX idx_daily_budgets_business_date ON daily_budgets(business_date DESC);

-- Alert Rules: Define thresholds and conditions for automated alerts
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_name TEXT NOT NULL UNIQUE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('variance', 'threshold', 'anomaly', 'stock', 'approval')),
  metric TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('>', '<', '>=', '<=', '=', '!=')),
  threshold_value NUMERIC(12,4),
  threshold_pct NUMERIC(5,2),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'warning',
  is_active BOOLEAN NOT NULL DEFAULT true,
  apply_to_venues UUID[], -- NULL means all venues
  notification_channels TEXT[] DEFAULT ARRAY['in_app'], -- in_app, email, sms
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_active ON alert_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_alert_rules_type ON alert_rules(rule_type);

-- Alerts: Triggered alerts for operator review
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  alert_rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'labor_overage', 'cogs_high', 'sales_low', 'cost_spike',
    'low_stock', 'pending_approval', 'variance_critical', 'anomaly_detected'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'warning',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB, -- Store related IDs, values, etc.
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_venue_id ON alerts(venue_id);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged) WHERE acknowledged = false;
CREATE INDEX idx_alerts_severity ON alerts(severity, created_at DESC);
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_budgets_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER daily_budgets_updated_at
  BEFORE UPDATE ON daily_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_budgets_alerts_updated_at();

CREATE TRIGGER alert_rules_updated_at
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_budgets_alerts_updated_at();

-- Function to create alert
CREATE OR REPLACE FUNCTION create_alert(
  p_venue_id UUID,
  p_alert_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT NULL,
  p_alert_rule_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO alerts (
    venue_id,
    alert_rule_id,
    alert_type,
    severity,
    title,
    message,
    metadata,
    created_at
  ) VALUES (
    p_venue_id,
    p_alert_rule_id,
    p_alert_type,
    p_severity,
    p_title,
    p_message,
    p_metadata,
    NOW()
  )
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql;

-- Function to acknowledge alert
CREATE OR REPLACE FUNCTION acknowledge_alert(
  p_alert_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE alerts
  SET
    acknowledged = true,
    acknowledged_at = NOW(),
    acknowledged_by = p_user_id
  WHERE id = p_alert_id
    AND acknowledged = false;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Seed default alert rules
INSERT INTO alert_rules (rule_name, rule_type, metric, condition, threshold_pct, severity, description) VALUES
  ('Labor Cost Over Budget 10%', 'variance', 'labor_cost_pct', '>', 10, 'critical', 'Alert when labor cost exceeds budget by more than 10%'),
  ('Labor Cost Over Budget 5%', 'variance', 'labor_cost_pct', '>', 5, 'warning', 'Alert when labor cost exceeds budget by more than 5%'),
  ('COGS High', 'variance', 'cogs_pct', '>', 1.5, 'warning', 'Alert when COGS percentage is 1.5%+ over budget'),
  ('Sales Low', 'variance', 'sales', '<', -10, 'warning', 'Alert when sales are 10%+ under budget'),
  ('Prime Cost High', 'threshold', 'prime_cost_pct', '>', 65, 'critical', 'Alert when prime cost exceeds 65%')
ON CONFLICT (rule_name) DO NOTHING;

COMMENT ON TABLE daily_budgets IS 'Daily budget targets for sales, labor, COGS, and prime cost by venue';
COMMENT ON TABLE alert_rules IS 'Configurable rules for automated alert generation';
COMMENT ON TABLE alerts IS 'Generated alerts for operator review and acknowledgment';
COMMENT ON FUNCTION create_alert IS 'Create a new alert for a venue';
COMMENT ON FUNCTION acknowledge_alert IS 'Mark an alert as acknowledged by a user';
