-- Add an ignore flag to invoice lines so junk OCR rows (qty=0, totals, headers)
-- can be excluded from bulk mapping and reporting.

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_is_ignored
  ON invoice_lines(is_ignored)
  WHERE is_ignored = true;

