-- Fix ambiguous column reference in suggest_gl_account_for_item_v2
-- This migration recreates the function with properly qualified column names

DROP FUNCTION IF EXISTS suggest_gl_account_for_item_v2(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION suggest_gl_account_for_item_v2(
  p_item_id UUID,
  p_organization_id UUID,
  p_vendor_id UUID DEFAULT NULL
) RETURNS TABLE (
  id UUID,
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
  -- Get item details with qualified column references
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
    SELECT gl_id, reason as suggestion_reason, use_count, 'high' as confidence FROM exact_item_history
    UNION ALL
    SELECT gl_id, reason as suggestion_reason, use_count, 'medium' as confidence FROM category_patterns
    UNION ALL
    SELECT gl_id, reason as suggestion_reason, use_count, 'medium' as confidence FROM vendor_patterns
  )

  SELECT DISTINCT ON (ga.id)
    ga.id AS id,
    ga.external_code AS external_code,
    ga.name AS name,
    ga.section AS section,
    COALESCE(s.confidence,
      CASE
        -- Fallback to rule-based suggestions
        WHEN v_item_category = 'food' AND ga.section = 'COGS' AND ga.name ILIKE '%food%' THEN 'medium'
        WHEN v_item_category = 'beverage' AND ga.section = 'COGS' AND ga.name ILIKE '%bev%' THEN 'medium'
        WHEN v_item_category IN ('packaging', 'supplies') AND ga.section = 'Opex' THEN 'low'
        ELSE 'low'
      END
    )::TEXT AS confidence,
    COALESCE(s.suggestion_reason, 'rule_based')::TEXT AS reason
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

COMMENT ON FUNCTION suggest_gl_account_for_item_v2 IS 'ML-enhanced GL account suggestions with learning loop - fixed column ambiguity';
