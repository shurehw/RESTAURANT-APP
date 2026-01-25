-- Apply unique constraint to prevent duplicate invoices
-- Migration 144 was never applied to production

ALTER TABLE invoices
ADD CONSTRAINT invoices_vendor_invoice_unique
UNIQUE NULLS NOT DISTINCT (vendor_id, invoice_number);

COMMENT ON CONSTRAINT invoices_vendor_invoice_unique ON invoices IS
'Prevent duplicate invoice numbers from the same vendor. NULLS NOT DISTINCT means even NULL invoice_numbers are considered equal (prevents multiple null invoices from same vendor).';
