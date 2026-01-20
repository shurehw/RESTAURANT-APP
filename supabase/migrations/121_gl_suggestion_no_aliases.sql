-- Final fix: Remove all AS aliases in SELECT to avoid PL/pgSQL variable conflicts
-- The RETURNS TABLE creates output variables, and using AS with those names causes ambiguity

DROP FUNCTION IF EXISTS suggest_gl_account_for_item_v2(UUID, UUID, UUID);

CREATE FUNCTION suggest_gl_account_for_item_v2(
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
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_item_category TEXT;
  v_item_name TEXT;
BEGIN
  -- Get item details
  SELECT i.category, i.name INTO v_item_category, v_item_name
  FROM items i
  WHERE i.id = p_item_id;

  -- Return suggestions
  RETURN QUERY
  WITH
  exact_item_history AS (
    SELECT
      f.selected_gl_account_id as gl_id,
      'exact_item_history'::TEXT as rsn,
      COUNT(*) as use_count
    FROM gl_mapping_feedback f
    WHERE f.item_id = p_item_id
      AND f.organization_id = p_organization_id
    GROUP BY f.selected_gl_account_id
  ),

  category_patterns AS (
    SELECT
      f.selected_gl_account_id as gl_id,
      'category_pattern'::TEXT as rsn,
      COUNT(*) as use_count
    FROM gl_mapping_feedback f
    WHERE f.item_category = v_item_category
      AND f.organization_id = p_organization_id
      AND f.item_id != p_item_id
    GROUP BY f.selected_gl_account_id
  ),

  vendor_patterns AS (
    SELECT
      f.selected_gl_account_id as gl_id,
      'vendor_pattern'::TEXT as rsn,
      COUNT(*) as use_count
    FROM gl_mapping_feedback f
    WHERE f.vendor_id = p_vendor_id
      AND f.organization_id = p_organization_id
      AND p_vendor_id IS NOT NULL
    GROUP BY f.selected_gl_account_id
  ),

  all_suggestions AS (
    SELECT gl_id, rsn, use_count, 'high'::TEXT as conf FROM exact_item_history
    UNION ALL
    SELECT gl_id, rsn, use_count, 'medium'::TEXT as conf FROM category_patterns
    UNION ALL
    SELECT gl_id, rsn, use_count, 'medium'::TEXT as conf FROM vendor_patterns
  )

  -- Return columns directly without AS aliases
  SELECT DISTINCT ON (ga.id)
    ga.id,
    ga.external_code,
    ga.name,
    ga.section,
    COALESCE(s.conf,
      CASE
        WHEN v_item_category = 'food' AND ga.section = 'COGS' AND ga.name ILIKE '%food%' THEN 'medium'
        WHEN v_item_category = 'beverage' AND ga.section = 'COGS' AND ga.name ILIKE '%bev%' THEN 'medium'
        WHEN v_item_category IN ('packaging', 'supplies') AND ga.section = 'Opex' THEN 'low'
        ELSE 'low'
      END
    )::TEXT,
    COALESCE(s.rsn, 'rule_based')::TEXT
  FROM gl_accounts ga
  LEFT JOIN all_suggestions s ON s.gl_id = ga.id
  WHERE ga.org_id = p_organization_id
    AND ga.is_active = true
    AND ga.is_summary = false
    AND (
      s.gl_id IS NOT NULL
      OR
      (v_item_category = 'food' AND ga.section = 'COGS') OR
      (v_item_category = 'beverage' AND ga.section = 'COGS') OR
      (v_item_category IN ('packaging', 'supplies') AND ga.section = 'Opex')
    )
  ORDER BY
    ga.id,
    CASE s.conf
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
      ELSE 4
    END,
    s.use_count DESC NULLS LAST,
    ga.display_order
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION suggest_gl_account_for_item_v2 IS 'ML-enhanced GL account suggestions';

NOTIFY pgrst, 'reload schema';
