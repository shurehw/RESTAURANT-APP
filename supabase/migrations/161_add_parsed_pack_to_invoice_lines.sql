-- Add structured pack parsing fields to invoice_lines
-- Captures parsed pack configuration from OCR for better matching and item creation

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS parsed_pack JSONB,              -- Structured pack info: {units_per_pack, unit_size, unit_size_uom, pack_type}
  ADD COLUMN IF NOT EXISTS normalized_description TEXT;    -- Description with variable weights stripped for matching

COMMENT ON COLUMN invoice_lines.parsed_pack IS 'Parsed pack configuration from description: {units_per_pack: 6, unit_size: 750, unit_size_uom: "mL", pack_type: "case"}';
COMMENT ON COLUMN invoice_lines.normalized_description IS 'Description with variable weights and noise stripped for consistent matching';

-- Index for normalized description matching
CREATE INDEX IF NOT EXISTS idx_invoice_lines_normalized_desc ON invoice_lines(normalized_description) WHERE normalized_description IS NOT NULL;

-- Example parsed_pack structures:
-- "6/750mL" -> {units_per_pack: 6, unit_size: 750, unit_size_uom: "mL", pack_type: "case"}
-- "1/12 CT" -> {units_per_pack: 12, unit_size: 1, unit_size_uom: "each", pack_type: "case"}
-- "4/5#"    -> {units_per_pack: 4, unit_size: 5, unit_size_uom: "lb", pack_type: "case"}
-- "28# CS"  -> {units_per_pack: 1, unit_size: 28, unit_size_uom: "lb", pack_type: "case"}
