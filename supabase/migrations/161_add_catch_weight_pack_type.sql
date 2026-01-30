-- Add 'catch_weight' as a valid pack_type for variable-weight items
-- Used for proteins, seafood, produce that are sold by weight

ALTER TABLE item_pack_configurations
  DROP CONSTRAINT IF EXISTS item_pack_configurations_pack_type_check;

ALTER TABLE item_pack_configurations
  ADD CONSTRAINT item_pack_configurations_pack_type_check
  CHECK (pack_type IN ('case', 'bottle', 'bag', 'box', 'each', 'keg', 'pail', 'drum', 'catch_weight'));

COMMENT ON CONSTRAINT item_pack_configurations_pack_type_check ON item_pack_configurations IS
  'Valid pack types including catch_weight for variable-weight items (meat, seafood, produce)';
