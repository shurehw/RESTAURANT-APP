-- Seed Product Weights with Example Data
-- These are placeholder values - replace with actual measured weights

-- Example 1: Jack Daniel's Old No. 7 - 750ml
INSERT INTO product_weights (
  sku_id,
  upc_ean,
  brand,
  product_name,
  size_ml,
  abv_percent,
  empty_g,
  empty_g_source,
  empty_g_source_ref,
  full_g,
  full_g_source,
  full_g_source_ref
) VALUES (
  gen_random_uuid(), -- Replace with actual item SKU ID from your items table
  '012345678901',
  'Jack Daniel''s',
  'Jack Daniel''s Old No. 7 Tennessee Whiskey',
  750,
  40.0,
  485.5,
  'seed_list',
  'manufacturer_spec',
  1200.3,
  'seed_list',
  'manufacturer_spec'
) ON CONFLICT (sku_id) DO NOTHING;

-- Example 2: Tito's Handmade Vodka - 1L
INSERT INTO product_weights (
  sku_id,
  upc_ean,
  brand,
  product_name,
  size_ml,
  abv_percent,
  empty_g,
  empty_g_source,
  empty_g_source_ref,
  full_g,
  full_g_source,
  full_g_source_ref
) VALUES (
  gen_random_uuid(), -- Replace with actual item SKU ID from your items table
  '098765432109',
  'Tito''s',
  'Tito''s Handmade Vodka',
  1000,
  40.0,
  520.8,
  'measured',
  'scale_reading_2024-01',
  1465.2,
  'measured',
  'scale_reading_2024-01'
) ON CONFLICT (sku_id) DO NOTHING;

-- Note: To properly seed, you should:
-- 1. First create items in the items table for these products
-- 2. Then use their actual UUIDs instead of gen_random_uuid()
-- 3. Or use the CSV import feature at /inventory/weights
