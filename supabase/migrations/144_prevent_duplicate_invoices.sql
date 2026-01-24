-- Prevent duplicate invoice numbers from the same vendor
-- This ensures we don't accidentally import the same invoice multiple times

-- Add unique constraint on (vendor_id, invoice_number)
-- This allows:
-- - Same invoice number from different vendors (OK)
-- - NULL invoice numbers (OCR might fail to extract it)
-- But prevents:
-- - Same invoice number from same vendor (duplicate)

ALTER TABLE invoices
ADD CONSTRAINT invoices_vendor_invoice_unique
UNIQUE NULLS NOT DISTINCT (vendor_id, invoice_number);

COMMENT ON CONSTRAINT invoices_vendor_invoice_unique ON invoices IS
'Prevent duplicate invoice numbers from the same vendor. NULLS NOT DISTINCT means even NULL invoice_numbers are considered equal (prevents multiple null invoices from same vendor).';
