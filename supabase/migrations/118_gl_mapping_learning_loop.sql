-- Learning loop for GL account suggestions
-- Tracks user decisions to improve future suggestions

-- 1. Create table to track GL mapping decisions
CREATE TABLE IF NOT EXISTS gl_mapping_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID NOT NULL REFERENCES items(id),

  -- What was suggested
  suggested_gl_account_id UUID REFERENCES gl_accounts(id),
  suggestion_confidence TEXT CHECK (suggestion_confidence IN ('high', 'medium', 'low')),
  suggestion_reason TEXT, -- 'category_match', 'keyword_match', 'vendor_pattern', etc.

  -- What user chose
  selected_gl_account_id UUID NOT NULL REFERENCES gl_accounts(id),
  was_suggestion_accepted BOOLEAN GENERATED ALWAYS AS (suggested_gl_account_id = selected_gl_account_id) STORED,

  -- Context
  item_category TEXT,
  item_name TEXT,
  vendor_id UUID REFERENCES vendors(id),
  invoice_id UUID REFERENCES invoices(id),

  -- User who made the decision
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(item_id, invoice_id) -- One feedback per item per invoice
);

CREATE INDEX idx_gl_mapping_feedback_org ON gl_mapping_feedback(organization_id);
CREATE INDEX idx_gl_mapping_feedback_item ON gl_mapping_feedback(item_id);
CREATE INDEX idx_gl_mapping_feedback_accepted ON gl_mapping_feedback(was_suggestion_accepted);
CREATE INDEX idx_gl_mapping_feedback_category ON gl_mapping_feedback(item_category);

COMMENT ON TABLE gl_mapping_feedback IS 'Learning loop: tracks GL mapping decisions to improve future suggestions';

-- 2. Create function to improve suggestions based on feedback
CREATE OR REPLACE FUNCTION suggest_gl_account_for_item_v2(
  p_item_id UUID,
  p_organization_id UUID,
  p_vendor_id UUID DEFAULT NULL
) RETURNS TABLE (
  gl_account_id UUID,
  external_code TEXT,
  name TEXT,
  section TEXT,
  confidence TEXT,
  reason TEXT
) AS $$
DECLARE
  v_item_category TEXT;
  v_item_name TEXT;
BEGIN
  -- Get item details
  SELECT i.category, i.name INTO v_item_category, v_item_name
  FROM items i
  WHERE i.id = p_item_id;

  -- Return suggestions with learning loop improvements
  RETURN QUERY
  WITH
  -- Historical mappings for this exact item (highest confidence)
  exact_item_history AS (
    SELECT
      f.selected_gl_account_id as gl_id,
      'exact_item_history' as reason,
      COUNT(*) as use_count
    FROM gl_mapping_feedback f
    WHERE f.item_id = p_item_id
      AND f.organization_id = p_organization_id
    GROUP BY f.selected_gl_account_id
  ),

  -- Similar items in same category (medium-high confidence)
  category_patterns AS (
    SELECT
      f.selected_gl_account_id as gl_id,
      'category_pattern' as reason,
      COUNT(*) as use_count
    FROM gl_mapping_feedback f
    WHERE f.item_category = v_item_category
      AND f.organization_id = p_organization_id
      AND f.item_id != p_item_id
    GROUP BY f.selected_gl_account_id
  ),

  -- Vendor-specific patterns (medium confidence)
  vendor_patterns AS (
    SELECT
      f.selected_gl_account_id as gl_id,
      'vendor_pattern' as reason,
      COUNT(*) as use_count
    FROM gl_mapping_feedback f
    WHERE f.vendor_id = p_vendor_id
      AND f.organization_id = p_organization_id
      AND p_vendor_id IS NOT NULL
    GROUP BY f.selected_gl_account_id
  ),

  -- Combined suggestions with confidence scoring
  all_suggestions AS (
    SELECT gl_id, reason, use_count, 'high' as confidence FROM exact_item_history
    UNION ALL
    SELECT gl_id, reason, use_count, 'medium' as confidence FROM category_patterns
    UNION ALL
    SELECT gl_id, reason, use_count, 'medium' as confidence FROM vendor_patterns
  )

  SELECT DISTINCT ON (ga.id)
    ga.id,
    ga.external_code,
    ga.name,
    ga.section,
    COALESCE(s.confidence,
      CASE
        -- Fallback to rule-based suggestions
        WHEN v_item_category = 'food' AND ga.section = 'COGS' AND ga.name ILIKE '%food%' THEN 'medium'
        WHEN v_item_category = 'beverage' AND ga.section = 'COGS' AND ga.name ILIKE '%bev%' THEN 'medium'
        WHEN v_item_category IN ('packaging', 'supplies') AND ga.section = 'Opex' THEN 'low'
        ELSE 'low'
      END
    )::TEXT as confidence,
    COALESCE(s.reason, 'rule_based')::TEXT as reason
  FROM gl_accounts ga
  LEFT JOIN all_suggestions s ON s.gl_id = ga.id
  WHERE ga.org_id = p_organization_id
    AND ga.is_active = true
    AND ga.is_summary = false
    AND (
      -- Include historical suggestions
      s.gl_id IS NOT NULL
      OR
      -- Include rule-based suggestions
      (v_item_category = 'food' AND ga.section = 'COGS') OR
      (v_item_category = 'beverage' AND ga.section = 'COGS') OR
      (v_item_category IN ('packaging', 'supplies') AND ga.section = 'Opex')
    )
  ORDER BY
    ga.id,
    CASE s.confidence
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
      ELSE 4
    END,
    s.use_count DESC NULLS LAST,
    ga.display_order
  LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION suggest_gl_account_for_item_v2 IS 'ML-enhanced GL suggestions using historical feedback + rule-based fallback';

-- 3. Function to record GL mapping decision (for learning loop)
CREATE OR REPLACE FUNCTION record_gl_mapping_decision(
  p_item_id UUID,
  p_gl_account_id UUID,
  p_organization_id UUID,
  p_suggested_gl_id UUID DEFAULT NULL,
  p_suggestion_confidence TEXT DEFAULT NULL,
  p_suggestion_reason TEXT DEFAULT NULL,
  p_vendor_id UUID DEFAULT NULL,
  p_invoice_id UUID DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_item_category TEXT;
  v_item_name TEXT;
BEGIN
  -- Get item details
  SELECT i.category, i.name INTO v_item_category, v_item_name
  FROM items i
  WHERE i.id = p_item_id;

  -- Record the decision
  INSERT INTO gl_mapping_feedback (
    organization_id,
    item_id,
    suggested_gl_account_id,
    suggestion_confidence,
    suggestion_reason,
    selected_gl_account_id,
    item_category,
    item_name,
    vendor_id,
    invoice_id,
    user_id
  ) VALUES (
    p_organization_id,
    p_item_id,
    p_suggested_gl_id,
    p_suggestion_confidence,
    p_suggestion_reason,
    p_gl_account_id,
    v_item_category,
    v_item_name,
    p_vendor_id,
    p_invoice_id,
    auth.uid()
  )
  ON CONFLICT (item_id, invoice_id)
  DO UPDATE SET
    selected_gl_account_id = EXCLUDED.selected_gl_account_id,
    user_id = auth.uid(),
    created_at = now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_gl_mapping_decision IS 'Records user GL mapping choice for machine learning';

-- 4. View to analyze suggestion accuracy
CREATE OR REPLACE VIEW gl_suggestion_accuracy AS
SELECT
  organization_id,
  item_category,
  suggestion_confidence,
  COUNT(*) as total_suggestions,
  SUM(CASE WHEN was_suggestion_accepted THEN 1 ELSE 0 END) as accepted_count,
  ROUND(100.0 * SUM(CASE WHEN was_suggestion_accepted THEN 1 ELSE 0 END) / COUNT(*), 2) as acceptance_rate_pct
FROM gl_mapping_feedback
WHERE suggested_gl_account_id IS NOT NULL
GROUP BY organization_id, item_category, suggestion_confidence
ORDER BY organization_id, item_category, suggestion_confidence;

COMMENT ON VIEW gl_suggestion_accuracy IS 'Analytics: measures GL suggestion accuracy for continuous improvement';

-- 5. Enable RLS
ALTER TABLE gl_mapping_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins full access to gl_mapping_feedback"
  ON gl_mapping_feedback FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users access their org gl_mapping_feedback"
  ON gl_mapping_feedback FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );
