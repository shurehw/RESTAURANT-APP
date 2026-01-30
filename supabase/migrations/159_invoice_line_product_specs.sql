-- Add product specification fields to invoice_lines
-- Captures vendor-specific details like catch weight, piece count, trim specs, etc.

ALTER TABLE invoice_lines
  ADD COLUMN catch_weight NUMERIC(12,3),           -- Actual billed weight (e.g., 29.40 LB)
  ADD COLUMN case_count INTEGER,                    -- Number of pieces per case (e.g., 4 PC)
  ADD COLUMN nominal_case_weight NUMERIC(12,3),    -- Expected/nominal case weight (e.g., 28#)
  ADD COLUMN product_specs JSONB;                   -- Flexible storage for trim, grade, origin, etc.

COMMENT ON COLUMN invoice_lines.catch_weight IS 'Actual weight billed (for catch-weight items like proteins, seafood)';
COMMENT ON COLUMN invoice_lines.case_count IS 'Number of pieces per case (e.g., "4 PC" in tenderloin case)';
COMMENT ON COLUMN invoice_lines.nominal_case_weight IS 'Expected/nominal case weight for variance detection';
COMMENT ON COLUMN invoice_lines.product_specs IS 'Vendor product specifications: {trim: "PSMO", grade: "USDA Choice", species: "beef", cut: "tenderloin", certifications: [...]}';

-- Index for querying product specs
CREATE INDEX idx_invoice_lines_product_specs ON invoice_lines USING GIN (product_specs);

-- Example product_specs structure:
-- {
--   "species": "beef",
--   "cut": "tenderloin",
--   "trim": "PSMO",
--   "grade": "USDA Choice",
--   "brand": "Swift",
--   "origin": "USA",
--   "certifications": ["USDA"]
-- }
