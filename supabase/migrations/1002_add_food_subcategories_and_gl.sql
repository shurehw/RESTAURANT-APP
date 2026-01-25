-- ============================================================================
-- Add Food Subcategories and GL Accounts for Proper Food Item Mapping
-- ============================================================================

-- Add subcategory validation comment (items.subcategory is already TEXT)
COMMENT ON COLUMN items.subcategory IS 'Food: meat_protein, seafood, produce, dairy, dry_goods, bakery, specialty | Beverage: beer, wine, spirits, na_beverage, mixer';

-- Create index on subcategory for faster filtering
CREATE INDEX IF NOT EXISTS idx_items_subcategory ON items(subcategory) WHERE subcategory IS NOT NULL;

-- ============================================================================
-- Add Food-Specific GL Accounts for Hwood Group
-- ============================================================================

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get Hwood Group org ID
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Hwood Group' LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    -- Insert Food COGS GL Accounts
    INSERT INTO gl_accounts (org_id, external_code, name, section, is_summary, is_active, display_order)
    VALUES
      -- Food COGS breakdown
      (v_org_id, '5300', 'Meat & Protein Cost', 'COGS', false, true, 300),
      (v_org_id, '5301', 'Seafood Cost', 'COGS', false, true, 301),
      (v_org_id, '5302', 'Produce Cost', 'COGS', false, true, 302),
      (v_org_id, '5303', 'Dairy & Eggs Cost', 'COGS', false, true, 303),
      (v_org_id, '5304', 'Dry Goods & Pantry Cost', 'COGS', false, true, 304),
      (v_org_id, '5305', 'Bakery Cost', 'COGS', false, true, 305),
      (v_org_id, '5306', 'Specialty & Gourmet Cost', 'COGS', false, true, 306),
      (v_org_id, '5307', 'Food Supplies & Disposables', 'COGS', false, true, 307)
    ON CONFLICT (org_id, name) DO NOTHING;

    RAISE NOTICE 'Added food GL accounts for Hwood Group';
  ELSE
    RAISE NOTICE 'Hwood Group organization not found - skipping GL account creation';
  END IF;
END $$;

-- ============================================================================
-- Add helper function to suggest GL account based on subcategory
-- ============================================================================

-- Drop all existing versions using DO block to handle ambiguity
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure as func_sig
    FROM pg_proc
    WHERE proname = 'suggest_gl_account_for_item'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.func_sig;
  END LOOP;
END $$;

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
  -- Map subcategory to GL code
  IF p_category = 'food' THEN
    v_gl_code := CASE p_subcategory
      WHEN 'meat_protein' THEN '5300'
      WHEN 'seafood' THEN '5301'
      WHEN 'produce' THEN '5302'
      WHEN 'dairy' THEN '5303'
      WHEN 'dry_goods' THEN '5304'
      WHEN 'bakery' THEN '5305'
      WHEN 'specialty' THEN '5306'
      ELSE '5300' -- Default to meat/protein
    END;
  ELSIF p_category = 'beverage' THEN
    v_gl_code := CASE p_subcategory
      WHEN 'beer' THEN '5315'
      WHEN 'wine' THEN '5310'
      WHEN 'spirits' THEN '5320'
      WHEN 'na_beverage' THEN '5335'
      ELSE '5310' -- Default to wine
    END;
  ELSE
    -- packaging, supplies
    v_gl_code := '5307'; -- Food supplies
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

COMMENT ON FUNCTION suggest_gl_account_for_item IS 'Auto-suggest GL account based on item category and subcategory';

-- ============================================================================
-- Add helper function to categorize item description
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_categorize_food_item(p_description text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_desc_lower text;
BEGIN
  v_desc_lower := lower(p_description);

  -- Meat & Protein
  IF v_desc_lower ~ '(beef|pork|chicken|lamb|steak|chop|ribs|brisket|bacon|sausage|ham|turkey|duck)' THEN
    RETURN 'meat_protein';
  END IF;

  -- Seafood
  IF v_desc_lower ~ '(salmon|tuna|shrimp|lobster|crab|fish|scallop|oyster|seafood|seabass|halibut|cod|mahi)' THEN
    RETURN 'seafood';
  END IF;

  -- Produce
  IF v_desc_lower ~ '(lettuce|tomato|onion|pepper|mushroom|herb|green|cucumber|carrot|celery|cabbage|brussels|asparagus|avocado|apple|lemon|lime|orange|grapefruit|berry|melon|squash|zucchini|potato|garlic|ginger|cilantro|parsley|basil|thyme|rosemary|sage|dill|chive|tarragon|mint)' THEN
    RETURN 'produce';
  END IF;

  -- Dairy & Eggs
  IF v_desc_lower ~ '(milk|cream|cheese|butter|eggs|yogurt|creme)' THEN
    RETURN 'dairy';
  END IF;

  -- Dry Goods
  IF v_desc_lower ~ '(flour|sugar|rice|pasta|grits|oil|vinegar|salt|pepper|spice|grain|bean|nut|seed)' THEN
    RETURN 'dry_goods';
  END IF;

  -- Bakery
  IF v_desc_lower ~ '(bread|bun|roll|pastry|croissant|baguette|tortilla)' THEN
    RETURN 'bakery';
  END IF;

  -- Specialty
  IF v_desc_lower ~ '(truffle|caviar|foie|wagyu|kobe|pate|gourmet)' THEN
    RETURN 'specialty';
  END IF;

  -- Default
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION auto_categorize_food_item IS 'Auto-detect food subcategory from item description using keyword matching';

-- ============================================================================
-- Backfill subcategories for existing food items
-- ============================================================================

UPDATE items
SET subcategory = auto_categorize_food_item(name)
WHERE category = 'food'
  AND subcategory IS NULL;

-- ============================================================================
-- Add trigger to auto-set subcategory on item insert/update
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_set_item_subcategory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only auto-set if subcategory is NULL and category is food
  IF NEW.category = 'food' AND NEW.subcategory IS NULL THEN
    NEW.subcategory := auto_categorize_food_item(NEW.name);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_set_item_subcategory
  BEFORE INSERT OR UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_item_subcategory();

COMMENT ON TRIGGER trg_auto_set_item_subcategory ON items IS 'Auto-detect and set food subcategory based on item name';
