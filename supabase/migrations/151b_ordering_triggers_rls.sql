-- TEST: Just add basic triggers, skip RLS for now

-- 1. Order number trigger
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'PO-' || TO_CHAR(NEW.order_date, 'YYYYMMDD') || '-' || LPAD(NEXTVAL('po_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number ON purchase_orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();

SELECT 'TRIGGER 1: order_number OK' as status;

-- 2. PO total trigger
CREATE OR REPLACE FUNCTION update_po_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_orders
  SET total_amount = (
    SELECT COALESCE(SUM(line_total), 0)
    FROM purchase_order_items
    WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_po_total_on_item_change ON purchase_order_items;
CREATE TRIGGER update_po_total_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_po_total();

SELECT 'TRIGGER 2: po_total OK' as status;

-- 3. Receipt total trigger  
CREATE OR REPLACE FUNCTION update_receipt_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE receipts
  SET total_amount = (
    SELECT COALESCE(SUM(line_total), 0)
    FROM receipt_lines
    WHERE receipt_id = COALESCE(NEW.receipt_id, OLD.receipt_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.receipt_id, OLD.receipt_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_receipt_total_on_line_change ON receipt_lines;
CREATE TRIGGER update_receipt_total_on_line_change
  AFTER INSERT OR UPDATE OR DELETE ON receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_receipt_total();

SELECT 'TRIGGER 3: receipt_total OK' as status;

-- 4. PO received quantity trigger
CREATE OR REPLACE FUNCTION update_po_item_received()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.purchase_order_item_id IS NOT NULL THEN
    UPDATE purchase_order_items
    SET qty_received = (
      SELECT COALESCE(SUM(rl.qty_received), 0)
      FROM receipt_lines rl
      WHERE rl.purchase_order_item_id = NEW.purchase_order_item_id
    )
    WHERE id = NEW.purchase_order_item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_po_received_on_receipt ON receipt_lines;
CREATE TRIGGER update_po_received_on_receipt
  AFTER INSERT OR UPDATE ON receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_po_item_received();

SELECT 'TRIGGER 4: po_received OK' as status;

-- 5. Item pars updated_at trigger
CREATE OR REPLACE FUNCTION update_item_pars_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS item_pars_updated_at ON item_pars;
CREATE TRIGGER item_pars_updated_at
  BEFORE UPDATE ON item_pars
  FOR EACH ROW
  EXECUTE FUNCTION update_item_pars_updated_at();

SELECT 'TRIGGER 5: item_pars_updated OK' as status;

SELECT 'ALL BASIC TRIGGERS CREATED!' as final_status;
