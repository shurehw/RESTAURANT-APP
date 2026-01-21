-- Allow zero quantity invoice lines to track vendor backorders/shortages
-- Change constraint from qty > 0 to qty >= 0

ALTER TABLE invoice_lines
DROP CONSTRAINT IF EXISTS il_positive_qty;

ALTER TABLE invoice_lines
ADD CONSTRAINT il_non_negative_qty CHECK (qty >= 0 AND unit_cost >= 0);

COMMENT ON CONSTRAINT il_non_negative_qty ON invoice_lines IS
'Allow qty=0 to track items ordered but not shipped (backorders, vendor shortages)';
