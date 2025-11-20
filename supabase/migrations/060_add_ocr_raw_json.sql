-- Add OCR raw JSON and image URL columns to invoices table

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS ocr_raw_json JSONB,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN invoices.ocr_raw_json IS 'Raw OCR extraction result from Claude API';
COMMENT ON COLUMN invoices.image_url IS 'Public URL to the uploaded invoice image/PDF';
