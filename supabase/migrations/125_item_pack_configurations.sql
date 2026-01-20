-- Item Pack Configurations
-- Allows tracking multiple ways to purchase the same item (by bottle, case, bag, etc.)
-- Enables accurate conversion from invoice units to recipe units

CREATE TABLE item_pack_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,

  -- Pack description
  pack_type TEXT NOT NULL CHECK (pack_type IN ('case', 'bottle', 'bag', 'box', 'each', 'keg', 'pail', 'drum')),
  units_per_pack NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (units_per_pack > 0),
  unit_size NUMERIC(12,3) NOT NULL CHECK (unit_size > 0),
  unit_size_uom TEXT NOT NULL, -- 'mL', 'L', 'oz', 'lb', 'g', 'kg', etc.

  -- Auto-calculated: how many recipe units (base_uom) in this pack
  -- e.g., if base_uom='oz' and pack is 6/750mL, conversion_factor = 152.4 oz
  conversion_factor NUMERIC(12,4) NOT NULL CHECK (conversion_factor > 0),

  -- Optional: vendor-specific pack configurations
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  vendor_item_code TEXT, -- vendor's SKU for this specific pack size

  -- Friendly description for display (auto-generated)
  display_name TEXT, -- e.g., "6/750mL Case", "1L Bottle", "5lb Bag"

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pack_configs_item ON item_pack_configurations(item_id);
CREATE INDEX idx_pack_configs_vendor ON item_pack_configurations(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX idx_pack_configs_active ON item_pack_configurations(item_id, is_active) WHERE is_active = true;

COMMENT ON TABLE item_pack_configurations IS 'Multiple purchase configurations for items (cases, bottles, bags) with conversion to recipe units';
COMMENT ON COLUMN item_pack_configurations.pack_type IS 'Type of packaging: case, bottle, bag, box, each, etc.';
COMMENT ON COLUMN item_pack_configurations.units_per_pack IS 'Number of individual units in this pack (e.g., 6 for 6-pack)';
COMMENT ON COLUMN item_pack_configurations.unit_size IS 'Size of each individual unit (e.g., 750 for 750mL)';
COMMENT ON COLUMN item_pack_configurations.unit_size_uom IS 'Unit of measure for unit_size (mL, L, oz, lb, etc.)';
COMMENT ON COLUMN item_pack_configurations.conversion_factor IS 'Auto-calculated: total amount in recipe units (base_uom) per pack';
COMMENT ON COLUMN item_pack_configurations.vendor_id IS 'Optional: specific to a vendor if they have unique pack sizes';

-- Function to auto-calculate conversion factor
-- Converts from pack units to recipe units (items.base_uom)
CREATE OR REPLACE FUNCTION calculate_pack_conversion_factor(
  p_units_per_pack NUMERIC,
  p_unit_size NUMERIC,
  p_unit_size_uom TEXT,
  p_base_uom TEXT
)
RETURNS NUMERIC AS $$
DECLARE
  total_in_pack_uom NUMERIC;
  conversion_to_base NUMERIC;
BEGIN
  -- First, calculate total amount in the pack's UOM
  total_in_pack_uom := p_units_per_pack * p_unit_size;

  -- Then convert to base_uom using standard conversion factors
  -- Volume conversions
  IF p_unit_size_uom = 'mL' AND p_base_uom = 'oz' THEN
    conversion_to_base := total_in_pack_uom * 0.033814; -- mL to fl oz
  ELSIF p_unit_size_uom = 'L' AND p_base_uom = 'oz' THEN
    conversion_to_base := total_in_pack_uom * 33.814; -- L to fl oz
  ELSIF p_unit_size_uom = 'mL' AND p_base_uom = 'L' THEN
    conversion_to_base := total_in_pack_uom / 1000; -- mL to L
  ELSIF p_unit_size_uom = 'L' AND p_base_uom = 'mL' THEN
    conversion_to_base := total_in_pack_uom * 1000; -- L to mL
  ELSIF p_unit_size_uom = 'gal' AND p_base_uom = 'oz' THEN
    conversion_to_base := total_in_pack_uom * 128; -- gal to fl oz
  ELSIF p_unit_size_uom = 'qt' AND p_base_uom = 'oz' THEN
    conversion_to_base := total_in_pack_uom * 32; -- qt to fl oz
  ELSIF p_unit_size_uom = 'pt' AND p_base_uom = 'oz' THEN
    conversion_to_base := total_in_pack_uom * 16; -- pt to fl oz

  -- Weight conversions
  ELSIF p_unit_size_uom = 'lb' AND p_base_uom = 'oz' THEN
    conversion_to_base := total_in_pack_uom * 16; -- lb to oz (weight)
  ELSIF p_unit_size_uom = 'oz' AND p_base_uom = 'lb' THEN
    conversion_to_base := total_in_pack_uom / 16; -- oz to lb
  ELSIF p_unit_size_uom = 'kg' AND p_base_uom = 'lb' THEN
    conversion_to_base := total_in_pack_uom * 2.20462; -- kg to lb
  ELSIF p_unit_size_uom = 'g' AND p_base_uom = 'oz' THEN
    conversion_to_base := total_in_pack_uom * 0.035274; -- g to oz

  -- Same unit (no conversion needed)
  ELSIF p_unit_size_uom = p_base_uom THEN
    conversion_to_base := total_in_pack_uom;

  -- Unknown conversion - return raw total and log warning
  ELSE
    RAISE WARNING 'Unknown conversion from % to %', p_unit_size_uom, p_base_uom;
    conversion_to_base := total_in_pack_uom;
  END IF;

  RETURN ROUND(conversion_to_base, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-calculate conversion_factor before insert/update
CREATE OR REPLACE FUNCTION set_pack_conversion_factor()
RETURNS TRIGGER AS $$
DECLARE
  item_base_uom TEXT;
BEGIN
  -- Get the item's base_uom
  SELECT base_uom INTO item_base_uom
  FROM items
  WHERE id = NEW.item_id;

  IF item_base_uom IS NULL THEN
    RAISE EXCEPTION 'Item with id % not found', NEW.item_id;
  END IF;

  -- Calculate conversion factor
  NEW.conversion_factor := calculate_pack_conversion_factor(
    NEW.units_per_pack,
    NEW.unit_size,
    NEW.unit_size_uom,
    item_base_uom
  );

  -- Generate display name
  IF NEW.units_per_pack = 1 THEN
    NEW.display_name := NEW.unit_size || NEW.unit_size_uom || ' ' || NEW.pack_type;
  ELSE
    NEW.display_name := NEW.units_per_pack || '/' || NEW.unit_size || NEW.unit_size_uom || ' ' || NEW.pack_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_pack_conversion_factor
  BEFORE INSERT OR UPDATE ON item_pack_configurations
  FOR EACH ROW
  EXECUTE FUNCTION set_pack_conversion_factor();

-- Example data for testing
-- Grey Goose Vodka with multiple pack configurations
DO $$
DECLARE
  vodka_item_id UUID;
BEGIN
  -- Check if we have a vodka item to use as example
  SELECT id INTO vodka_item_id
  FROM items
  WHERE name ILIKE '%vodka%'
  LIMIT 1;

  IF vodka_item_id IS NOT NULL THEN
    -- Add example pack configurations
    INSERT INTO item_pack_configurations (item_id, pack_type, units_per_pack, unit_size, unit_size_uom)
    VALUES
      -- Case of 6x750mL bottles
      (vodka_item_id, 'case', 6, 750, 'mL'),
      -- Single 750mL bottle
      (vodka_item_id, 'bottle', 1, 750, 'mL'),
      -- Single 1L bottle
      (vodka_item_id, 'bottle', 1, 1, 'L'),
      -- Case of 12x750mL bottles (Costco)
      (vodka_item_id, 'case', 12, 750, 'mL')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
