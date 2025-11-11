-- ============================================================================
-- Add vendor item code and description for OCR mapping
-- ============================================================================

-- Add vendor-specific fields to vendor_items table
ALTER TABLE vendor_items
ADD COLUMN IF NOT EXISTS vendor_item_code TEXT,
ADD COLUMN IF NOT EXISTS vendor_description TEXT,
ADD COLUMN IF NOT EXISTS pack_size TEXT,
ADD COLUMN IF NOT EXISTS last_price NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS last_order_date DATE;

-- Create index for fast lookup by vendor item code
CREATE INDEX IF NOT EXISTS idx_vi_vendor_code ON vendor_items(vendor_id, vendor_item_code) WHERE vendor_item_code IS NOT NULL;

-- Create index for fuzzy text search on vendor description
CREATE INDEX IF NOT EXISTS idx_vi_vendor_desc ON vendor_items USING gin(to_tsvector('english', vendor_description)) WHERE vendor_description IS NOT NULL;

COMMENT ON COLUMN vendor_items.vendor_item_code IS 'Vendor-specific SKU/item number for auto-mapping from invoices';
COMMENT ON COLUMN vendor_items.vendor_description IS 'Vendor-specific item description from their catalog';
COMMENT ON COLUMN vendor_items.pack_size IS 'Vendor pack size (e.g., "6/10oz", "Case of 12")';
COMMENT ON COLUMN vendor_items.last_price IS 'Most recent price from invoice';
COMMENT ON COLUMN vendor_items.last_order_date IS 'Last date this item was ordered';
