/**
 * Migration 041: Exception Rules
 * Purpose: Configurable thresholds for auto-approval and exception handling
 */

-- Exception Rules: Fine-grained control over what requires manual review
CREATE TABLE IF NOT EXISTS exception_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_name TEXT NOT NULL UNIQUE,
  rule_category TEXT NOT NULL CHECK (rule_category IN ('invoice', 'receipt', 'variance', 'inventory', 'labor')),

  -- Conditions
  field_name TEXT NOT NULL, -- e.g., 'total_variance_pct', 'quantity_variance', 'labor_cost_pct'
  operator TEXT NOT NULL CHECK (operator IN ('>', '<', '>=', '<=', '=', '!=', 'between')),
  threshold_value NUMERIC(12,4),
  threshold_min NUMERIC(12,4), -- For 'between' operator
  threshold_max NUMERIC(12,4), -- For 'between' operator

  -- Actions
  action TEXT NOT NULL CHECK (action IN ('auto_approve', 'require_review', 'alert', 'block')),
  alert_severity TEXT CHECK (alert_severity IN ('info', 'warning', 'critical')),

  -- Scope
  apply_to_venues UUID[], -- NULL = all venues
  apply_to_vendors UUID[], -- NULL = all vendors
  apply_to_categories TEXT[], -- Item categories or vendor categories

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100, -- Lower = higher priority

  -- Metadata
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exception_rules_active ON exception_rules(is_active, priority)
  WHERE is_active = true;
CREATE INDEX idx_exception_rules_category ON exception_rules(rule_category);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_exception_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exception_rules_updated_at
  BEFORE UPDATE ON exception_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_exception_rules_updated_at();

-- Function to evaluate exception rules for invoices
CREATE OR REPLACE FUNCTION evaluate_invoice_exception_rules(
  p_invoice_id UUID
)
RETURNS TABLE(
  rule_id UUID,
  rule_name TEXT,
  action TEXT,
  alert_severity TEXT,
  matched BOOLEAN
) AS $$
DECLARE
  v_invoice RECORD;
  v_rule RECORD;
  v_field_value NUMERIC;
BEGIN
  -- Get invoice details
  SELECT
    i.*,
    v.id as vendor_id,
    ve.id as venue_id
  INTO v_invoice
  FROM invoices i
  JOIN vendors v ON i.vendor_id = v.id
  JOIN venues ve ON i.venue_id = ve.id
  WHERE i.id = p_invoice_id;

  -- Loop through active rules for invoices
  FOR v_rule IN
    SELECT *
    FROM exception_rules
    WHERE rule_category = 'invoice'
      AND is_active = true
      AND (apply_to_venues IS NULL OR v_invoice.venue_id = ANY(apply_to_venues))
      AND (apply_to_vendors IS NULL OR v_invoice.vendor_id = ANY(apply_to_vendors))
    ORDER BY priority ASC
  LOOP
    -- Get field value from invoice
    CASE v_rule.field_name
      WHEN 'total_variance_pct' THEN v_field_value := ABS(v_invoice.total_variance_pct);
      WHEN 'total_amount' THEN v_field_value := v_invoice.total_amount;
      WHEN 'match_confidence' THEN v_field_value := v_invoice.match_confidence;
      ELSE v_field_value := NULL;
    END CASE;

    -- Evaluate condition
    IF v_field_value IS NOT NULL THEN
      CASE v_rule.operator
        WHEN '>' THEN
          IF v_field_value > v_rule.threshold_value THEN
            rule_id := v_rule.id;
            rule_name := v_rule.rule_name;
            action := v_rule.action;
            alert_severity := v_rule.alert_severity;
            matched := true;
            RETURN NEXT;
          END IF;
        WHEN '<' THEN
          IF v_field_value < v_rule.threshold_value THEN
            rule_id := v_rule.id;
            rule_name := v_rule.rule_name;
            action := v_rule.action;
            alert_severity := v_rule.alert_severity;
            matched := true;
            RETURN NEXT;
          END IF;
        WHEN '>=' THEN
          IF v_field_value >= v_rule.threshold_value THEN
            rule_id := v_rule.id;
            rule_name := v_rule.rule_name;
            action := v_rule.action;
            alert_severity := v_rule.alert_severity;
            matched := true;
            RETURN NEXT;
          END IF;
        WHEN '<=' THEN
          IF v_field_value <= v_rule.threshold_value THEN
            rule_id := v_rule.id;
            rule_name := v_rule.rule_name;
            action := v_rule.action;
            alert_severity := v_rule.alert_severity;
            matched := true;
            RETURN NEXT;
          END IF;
        WHEN 'between' THEN
          IF v_field_value BETWEEN v_rule.threshold_min AND v_rule.threshold_max THEN
            rule_id := v_rule.id;
            rule_name := v_rule.rule_name;
            action := v_rule.action;
            alert_severity := v_rule.alert_severity;
            matched := true;
            RETURN NEXT;
          END IF;
      END CASE;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Seed default exception rules
INSERT INTO exception_rules (rule_name, rule_category, field_name, operator, threshold_value, action, alert_severity, priority, description) VALUES
  -- Invoice Rules
  ('Auto-approve invoices with <2% variance', 'invoice', 'total_variance_pct', '<', 2, 'auto_approve', NULL, 10, 'Automatically approve invoices with variance under 2%'),
  ('Review invoices with 2-5% variance', 'invoice', 'total_variance_pct', 'between', NULL, 'require_review', 'warning', 20, 'Flag for review if variance between 2-5%'),
  ('Block invoices with >10% variance', 'invoice', 'total_variance_pct', '>', 10, 'block', 'critical', 30, 'Block and alert on invoices with >10% variance'),
  ('Review large invoices >$5000', 'invoice', 'total_amount', '>', 5000, 'require_review', 'info', 40, 'Require review for invoices over $5000'),

  -- Variance Rules
  ('Alert on labor cost >10% over budget', 'variance', 'labor_variance_pct', '>', 10, 'alert', 'critical', 50, 'Critical alert when labor exceeds budget by 10%'),
  ('Warn on labor cost >5% over budget', 'variance', 'labor_variance_pct', '>', 5, 'alert', 'warning', 60, 'Warning when labor exceeds budget by 5%'),
  ('Alert on COGS >3% over budget', 'variance', 'cogs_variance_pct', '>', 3, 'alert', 'critical', 70, 'Critical alert when COGS variance exceeds 3%'),

  -- Inventory Rules
  ('Alert on low stock', 'inventory', 'quantity_on_hand', '<', 0, 'alert', 'warning', 80, 'Alert when item falls below reorder point')

ON CONFLICT (rule_name) DO NOTHING;

COMMENT ON TABLE exception_rules IS 'Configurable rules for auto-approval, alerts, and exception handling';
COMMENT ON FUNCTION evaluate_invoice_exception_rules IS 'Evaluate all active exception rules for a given invoice';
