-- Add vendor_item_code column to invoice_lines for better auto-matching
-- This captures the vendor's SKU/item code from OCR for future matching

ALTER TABLE invoice_lines
ADD COLUMN IF NOT EXISTS vendor_item_code TEXT;

-- Add index for faster lookups when matching
CREATE INDEX IF NOT EXISTS idx_invoice_lines_vendor_code
ON invoice_lines(vendor_item_code)
WHERE vendor_item_code IS NOT NULL;

-- Add comment
COMMENT ON COLUMN invoice_lines.vendor_item_code IS 'Vendor SKU/item code extracted from OCR for auto-matching future invoices';
