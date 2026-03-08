-- ============================================================================
-- Improve Auto-Categorization for Food Items (Edge Cases)
-- ============================================================================
-- Fixes issues like:
-- - "Extra Virgin Olive Oil" being categorized as "Gin"
-- - Missing keywords for oils, sauces, condiments, etc.

CREATE OR REPLACE FUNCTION auto_categorize_food_item(p_description text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_desc_lower text;
BEGIN
  v_desc_lower := lower(p_description);

  -- Order matters: check most specific categories first!

  -- Specialty (check first before other categories claim keywords)
  IF v_desc_lower ~ '(truffle|caviar|foie|wagyu|kobe|pate|gourmet|a5|prime rib)' THEN
    RETURN 'specialty';
  END IF;

  -- Meat & Protein
  IF v_desc_lower ~ '(beef|pork|chicken|lamb|steak|chop|ribs|brisket|bacon|sausage|ham|turkey|duck|veal|venison|quail|prosciutto|salami|pepperoni|chorizo|mortadella)' THEN
    RETURN 'meat_protein';
  END IF;

  -- Seafood
  IF v_desc_lower ~ '(salmon|tuna|shrimp|lobster|crab|fish|scallop|oyster|seafood|seabass|halibut|cod|mahi|snapper|grouper|tilapia|catfish|trout|anchovies|sardine|calamari|octopus|clam|mussel)' THEN
    RETURN 'seafood';
  END IF;

  -- Dairy & Eggs
  IF v_desc_lower ~ '(milk|cream|cheese|butter|eggs|yogurt|creme|mozzarella|parmesan|cheddar|feta|goat cheese|brie|ricotta|mascarpone|burrata|queso)' THEN
    RETURN 'dairy';
  END IF;

  -- Bakery
  IF v_desc_lower ~ '(bread|bun|roll|pastry|croissant|baguette|tortilla|bagel|muffin|scone|brioche|focaccia|ciabatta|pita|naan|flatbread)' THEN
    RETURN 'bakery';
  END IF;

  -- Produce (expanded with more items)
  IF v_desc_lower ~ '(lettuce|tomato|onion|pepper|mushroom|herb|green|cucumber|carrot|celery|cabbage|brussels|asparagus|avocado|apple|lemon|lime|orange|grapefruit|berry|melon|squash|zucchini|potato|garlic|ginger|cilantro|parsley|basil|thyme|rosemary|sage|dill|chive|tarragon|mint|arugula|spinach|kale|chard|watercress|endive|radicchio|fennel|leek|shallot|scallion|radish|beet|turnip|parsnip|rutabaga|artichoke|eggplant|broccoli|cauliflower|pumpkin|yam|sweet potato|corn|pea|edamame|okra|jalapeño|habanero|poblano|serrano|banana|pineapple|mango|papaya|kiwi|fig|date|pomegranate|cranberry|blueberry|raspberry|blackberry|strawberry|grape|cherry|peach|plum|apricot|nectarine|pear|watermelon|cantaloupe|honeydew)' THEN
    RETURN 'produce';
  END IF;

  -- Dry Goods (expanded with oils, sauces, condiments, nuts)
  IF v_desc_lower ~ '(flour|sugar|rice|pasta|grits|oil|olive oil|canola|vegetable oil|sesame oil|coconut oil|vinegar|balsamic|red wine vinegar|white wine vinegar|apple cider vinegar|salt|pepper|spice|grain|bean|nut|walnut|almond|pecan|cashew|pistachio|hazelnut|peanut|macadamia|pine nut|seed|sesame|sunflower|pumpkin seed|chia|flax|quinoa|couscous|bulgur|farro|barley|oat|cornmeal|polenta|breadcrumb|panko|sauce|soy sauce|worcestershire|tabasco|sriracha|hot sauce|ketchup|mustard|mayo|mayonnaise|aioli|pesto|marinara|salsa|chutney|relish|jam|jelly|honey|syrup|maple syrup|molasses|agave|stock|broth|bouillon|tomato paste|tomato sauce|coconut milk|evaporated milk|condensed milk|tahini|hummus|bean|chickpea|lentil|black bean|kidney bean|pinto bean|white bean|navy bean|cannellini|dried|canned)' THEN
    RETURN 'dry_goods';
  END IF;

  -- Default: cannot categorize
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION auto_categorize_food_item IS 'Auto-detect food subcategory from item description - improved with edge cases for oils, sauces, condiments, expanded produce';

-- ============================================================================
-- Backfill subcategories for existing items that may have been miscategorized
-- ============================================================================

-- Re-categorize all food items to fix any mistakes
UPDATE items
SET subcategory = auto_categorize_food_item(name)
WHERE category = 'food';

-- ============================================================================
-- Update GL accounts for re-categorized items
-- ============================================================================

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get org ID
  SELECT id INTO v_org_id FROM organizations WHERE name = 'The h.wood Group' LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    -- Update GL accounts based on new subcategories
    UPDATE items
    SET gl_account_id = suggest_gl_account_for_item(category::item_category, subcategory, v_org_id)
    WHERE category = 'food'
      AND subcategory IS NOT NULL;

    RAISE NOTICE 'Re-categorized food items and updated GL accounts';
  END IF;
END $$;
