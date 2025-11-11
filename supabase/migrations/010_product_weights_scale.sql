-- Bluetooth Scale Liquor Weighing System
-- Product weights tracking with tare/full bottle data

-- Product weights table: per-SKU bottle weights (tare + optional full)
CREATE TABLE IF NOT EXISTS product_weights (
  sku_id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  upc_ean TEXT,
  brand TEXT,
  product_name TEXT,
  size_ml INTEGER NOT NULL CHECK (size_ml > 0),
  abv_percent NUMERIC(5,2) NOT NULL DEFAULT 40.00 CHECK (abv_percent BETWEEN 0 AND 80),

  -- Empty bottle weight (tare)
  empty_g NUMERIC(10,2),
  empty_g_source TEXT CHECK (empty_g_source IN ('measured','seed_list','manufacturer')),
  empty_g_source_ref TEXT,

  -- Full sealed bottle weight (optional but improves accuracy)
  full_g NUMERIC(10,2),
  full_g_source TEXT CHECK (full_g_source IN ('measured','seed_list','manufacturer')),
  full_g_source_ref TEXT,

  -- Verification tracking
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_product_weights_updated_at
BEFORE UPDATE ON product_weights
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS policies
ALTER TABLE product_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read product weights"
ON product_weights FOR SELECT
USING (true);

CREATE POLICY "Users can insert product weights"
ON product_weights FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update product weights"
ON product_weights FOR UPDATE
USING (true);

-- Density helper: ABV → g/ml approximation at room temp
-- Linear interpolation between water (1.000 g/ml) and ethanol (0.789 g/ml)
CREATE OR REPLACE FUNCTION spirit_density_g_per_ml(abv_percent NUMERIC)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$
  SELECT ROUND(
    ( (100 - abv_percent)/100.0 * 1.000 + (abv_percent/100.0) * 0.789 )::NUMERIC,
    3
  );
$$;

-- Compute empty_g from a measured sealed full bottle
CREATE OR REPLACE FUNCTION compute_empty_from_full(
  full_g NUMERIC,
  size_ml INTEGER,
  abv_percent NUMERIC
)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$
  SELECT full_g - ( size_ml * spirit_density_g_per_ml(abv_percent) );
$$;

-- Inventory scale readings log (audit trail)
CREATE TABLE IF NOT EXISTS inventory_scale_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  count_session_id UUID NOT NULL,
  sku_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,

  -- Weight measurement
  weight_g NUMERIC(10,2) NOT NULL,
  fill_ratio NUMERIC(6,4) NOT NULL CHECK (fill_ratio BETWEEN 0 AND 1),
  est_remaining_ml NUMERIC(10,2) NOT NULL,

  -- Computation method used
  computed_from TEXT NOT NULL CHECK (computed_from IN ('empty_full','empty_only','seed_only')),
  used_empty_g NUMERIC(10,2),
  used_full_g NUMERIC(10,2),
  abv_percent NUMERIC(5,2),

  -- Audit
  captured_by UUID NOT NULL REFERENCES auth.users(id),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE inventory_scale_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their venue's scale readings"
ON inventory_scale_readings FOR SELECT
USING (true);

CREATE POLICY "Users can insert scale readings"
ON inventory_scale_readings FOR INSERT
WITH CHECK (true);

-- Index for performance
CREATE INDEX idx_scale_readings_venue ON inventory_scale_readings(venue_id, captured_at DESC);
CREATE INDEX idx_scale_readings_sku ON inventory_scale_readings(sku_id, captured_at DESC);
CREATE INDEX idx_scale_readings_session ON inventory_scale_readings(count_session_id);

-- View: Latest weights per SKU with verification status
CREATE OR REPLACE VIEW v_product_weights_status AS
SELECT
  pw.*,
  i.name as item_name,
  i.category,
  CASE
    WHEN pw.verified_at IS NOT NULL THEN 'verified'
    WHEN pw.empty_g_source = 'measured' THEN 'measured'
    WHEN pw.empty_g_source = 'seed_list' THEN 'needs_verification'
    ELSE 'missing'
  END as status,
  CASE
    WHEN pw.full_g IS NOT NULL THEN true
    ELSE false
  END as has_full_weight,
  (
    SELECT COUNT(*)
    FROM inventory_scale_readings isr
    WHERE isr.sku_id = pw.sku_id
  ) as reading_count
FROM product_weights pw
INNER JOIN items i ON i.id = pw.sku_id;
