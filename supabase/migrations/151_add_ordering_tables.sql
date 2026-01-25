-- ============================================================================
-- ORDERING TABLES - Step by step creation
-- ============================================================================

-- Enums
DO $$ BEGIN CREATE TYPE order_status AS ENUM ('draft', 'pending', 'ordered', 'received', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE receipt_status AS ENUM ('auto_generated', 'manual', 'partial', 'complete'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE match_confidence AS ENUM ('high', 'medium', 'low', 'unmapped'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE variance_severity AS ENUM ('none', 'minor', 'warning', 'critical'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. Purchase Orders (already created, but IF NOT EXISTS is safe)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  venue_id UUID NOT NULL REFERENCES venues(id),
  order_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,
  status order_status DEFAULT 'draft',
  total_amount NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_venue ON purchase_orders(venue_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
SELECT 'STEP 1: purchase_orders OK' as status;

-- 2. Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  quantity NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,4) NOT NULL,
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  qty_received NUMERIC(12,3) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poi_order ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_item ON purchase_order_items(item_id);
SELECT 'STEP 2: purchase_order_items OK' as status;

-- 3. Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  venue_id UUID NOT NULL REFERENCES venues(id),
  invoice_id UUID REFERENCES invoices(id),
  received_at TIMESTAMPTZ DEFAULT now(),
  received_by UUID REFERENCES auth.users(id),
  auto_generated BOOLEAN DEFAULT true,
  status receipt_status DEFAULT 'auto_generated',
  total_amount NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receipts_po ON receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_receipts_vendor ON receipts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_receipts_venue ON receipts(venue_id);
SELECT 'STEP 3: receipts OK' as status;

-- 4. Receipt Lines
CREATE TABLE IF NOT EXISTS receipt_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES purchase_order_items(id),
  invoice_line_id UUID REFERENCES invoice_lines(id),
  item_id UUID REFERENCES items(id),
  qty_received NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL,
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (qty_received * unit_cost) STORED,
  match_confidence match_confidence DEFAULT 'high',
  price_variance_pct NUMERIC(5,2),
  qty_variance_pct NUMERIC(5,2),
  variance_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rl_receipt ON receipt_lines(receipt_id);
CREATE INDEX IF NOT EXISTS idx_rl_item ON receipt_lines(item_id);
SELECT 'STEP 4: receipt_lines OK' as status;

-- 5. Vendor Tolerances
CREATE TABLE IF NOT EXISTS vendor_tolerances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID REFERENCES vendors(id),
  matching_mode TEXT DEFAULT 'flexible',
  price_tolerance_pct NUMERIC(5,2) DEFAULT 3.0,
  qty_tolerance_pct NUMERIC(5,2) DEFAULT 5.0,
  require_po_number BOOLEAN DEFAULT false,
  auto_approve_threshold_pct NUMERIC(5,2) DEFAULT 90.0,
  critical_items JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
SELECT 'STEP 5: vendor_tolerances OK' as status;

-- 6. Unmapped Items
CREATE TABLE IF NOT EXISTS unmapped_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  raw_description TEXT NOT NULL,
  pack_size TEXT,
  unit_of_measure TEXT,
  last_unit_cost NUMERIC(12,4),
  last_seen_invoice_id UUID REFERENCES invoices(id),
  occurrence_count INT DEFAULT 1,
  mapped_to_item_id UUID REFERENCES items(id),
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
SELECT 'STEP 6: unmapped_items OK' as status;

-- 7. Invoice Variances
CREATE TABLE IF NOT EXISTS invoice_variances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES receipts(id),
  variance_type TEXT NOT NULL,
  severity variance_severity NOT NULL,
  line_count INT DEFAULT 0,
  total_variance_amount NUMERIC(12,2),
  variance_pct NUMERIC(5,2),
  description TEXT,
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
SELECT 'STEP 7: invoice_variances OK' as status;

-- 8. Vendor Item Aliases
CREATE TABLE IF NOT EXISTS vendor_item_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  item_id UUID NOT NULL REFERENCES items(id),
  vendor_item_code TEXT NOT NULL,
  vendor_description TEXT,
  pack_size TEXT,
  last_unit_cost NUMERIC(12,4),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendor_id, vendor_item_code)
);
SELECT 'STEP 8: vendor_item_aliases OK' as status;

-- 9. Inventory Balances
CREATE TABLE IF NOT EXISTS inventory_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC(12,3) DEFAULT 0,
  unit_of_measure TEXT NOT NULL DEFAULT 'EA',
  last_cost NUMERIC(12,4),
  last_received_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ib_unique_venue_item UNIQUE(venue_id, item_id)
);
SELECT 'STEP 9: inventory_balances OK' as status;

-- 10. Inventory Transactions
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,4),
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
SELECT 'STEP 10: inventory_transactions OK' as status;

-- 11. Item Pars
CREATE TABLE IF NOT EXISTS item_pars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  par_level NUMERIC(12,3) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(12,3) NOT NULL DEFAULT 0,
  reorder_quantity NUMERIC(12,3),
  max_level NUMERIC(12,3),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT item_pars_unique UNIQUE(venue_id, item_id)
);
SELECT 'STEP 11: item_pars OK' as status;

-- 12. Item Cost History
CREATE TABLE IF NOT EXISTS item_cost_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  cost NUMERIC(12,4) NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT 'STEP 12: item_cost_history OK' as status;

-- 13. Add columns to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS po_number_ocr TEXT,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_variance_pct NUMERIC(5,2);
SELECT 'STEP 13: invoices columns added OK' as status;

-- 14. Sequence
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;
SELECT 'STEP 14: sequence OK' as status;

SELECT 'ALL TABLES CREATED SUCCESSFULLY!' as final_status;
