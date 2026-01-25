-- ============================================================================
-- Fix Food Item Mapping to Use EXISTING GL Accounts
-- ============================================================================

-- Update the GL suggestion function to use ACTUAL GL codes
DROP FUNCTION IF EXISTS suggest_gl_account_for_item(item_category, text, uuid);

CREATE OR REPLACE FUNCTION suggest_gl_account_for_item(
  p_category item_category,
  p_subcategory text,
  p_org_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_gl_account_id uuid;
  v_gl_code text;
BEGIN
  -- Map subcategory to ACTUAL GL codes in your system
  IF p_category = 'food' THEN
    v_gl_code := CASE p_subcategory
      WHEN 'meat_protein' THEN '5110'  -- Meat Cost
      WHEN 'seafood' THEN '5120'        -- Seafood Cost
      WHEN 'produce' THEN '5140'        -- Produce Cost
      WHEN 'dairy' THEN '5150'          -- Dairy Cost
      WHEN 'bakery' THEN '5160'         -- Bakery Cost
      WHEN 'dry_goods' THEN '5170'      -- Grocery and Dry Goods Cost
      WHEN 'specialty' THEN '5110'      -- Default to Meat (for specialty proteins like Wagyu)
      ELSE '5100'                        -- General Food Cost
    END;
  ELSIF p_category = 'beverage' THEN
    v_gl_code := CASE p_subcategory
      WHEN 'spirits' THEN '5310'        -- Liquor Cost
      WHEN 'wine' THEN '5320'           -- Wine Cost
      WHEN 'beer' THEN '5330'           -- Beer Cost
      WHEN 'na_beverage' THEN '5335'    -- N/A Beverage Cost
      WHEN 'mixer' THEN '5315'          -- Bar Consumables
      ELSE '5305'                        -- General Beverage Cost
    END;
  ELSE
    -- packaging, supplies
    v_gl_code := '5170'; -- Grocery/Dry Goods
  END IF;

  -- Get GL account ID
  SELECT id INTO v_gl_account_id
  FROM gl_accounts
  WHERE org_id = p_org_id
    AND external_code = v_gl_code
  LIMIT 1;

  RETURN v_gl_account_id;
END;
$$;

COMMENT ON FUNCTION suggest_gl_account_for_item IS 'Auto-suggest GL account using ACTUAL GL codes: 5110-5170 for food, 5310-5335 for beverages';

-- Delete the incorrectly created GL accounts from migration 1002
DELETE FROM gl_accounts
WHERE external_code IN ('5300', '5301', '5302', '5303', '5304', '5305', '5306', '5307')
  AND section = 'COGS';

-- Update items that may have been mapped to wrong GL accounts
-- Note: category is already item_category type, cast just in case
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE name = 'The h.wood Group' LIMIT 1;

  UPDATE items
  SET gl_account_id = suggest_gl_account_for_item(category::item_category, subcategory, v_org_id)
  WHERE category = 'food'
    AND subcategory IS NOT NULL;
END $$;
