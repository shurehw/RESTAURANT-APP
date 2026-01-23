/**
 * Migration 135: Fix Invoice Cost Spike Trigger
 * Purpose: Fix the detect_invoice_cost_spike function to use the correct column name (unit_cost instead of unit_price)
 */

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS detect_invoice_cost_spike_trigger ON invoice_lines;

-- Recreate the function with the correct column name
CREATE OR REPLACE FUNCTION detect_invoice_cost_spike()
RETURNS TRIGGER AS $$
DECLARE
  v_historical_avg NUMERIC;
  v_std_dev NUMERIC;
  v_z_score NUMERIC;
  v_variance_pct NUMERIC;
  v_vendor_name TEXT;
  v_item_name TEXT;
  v_venue_id UUID;
BEGIN
  -- Only check if unit_cost is provided and item is mapped
  IF NEW.unit_cost IS NULL OR NEW.unit_cost = 0 OR NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get venue_id and vendor info from invoice
  SELECT i.venue_id, v.name
  INTO v_venue_id, v_vendor_name
  FROM invoices i
  JOIN vendors v ON i.vendor_id = v.id
  WHERE i.id = NEW.invoice_id;

  -- Get item name
  SELECT name INTO v_item_name FROM items WHERE id = NEW.item_id;

  -- Calculate 90-day historical average and standard deviation from invoices
  SELECT
    AVG(il.unit_cost),
    STDDEV(il.unit_cost)
  INTO v_historical_avg, v_std_dev
  FROM invoice_lines il
  JOIN invoices i ON il.invoice_id = i.id
  WHERE il.item_id = NEW.item_id
    AND il.unit_cost IS NOT NULL
    AND il.unit_cost > 0
    AND il.created_at > NOW() - INTERVAL '90 days'
    AND il.id != NEW.id;

  -- Need at least 5 historical records
  IF v_historical_avg IS NULL OR v_std_dev IS NULL OR v_std_dev = 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate z-score
  v_z_score := (NEW.unit_cost - v_historical_avg) / v_std_dev;
  v_variance_pct := ((NEW.unit_cost - v_historical_avg) / v_historical_avg) * 100;

  -- Alert if z-score > 2
  IF ABS(v_z_score) > 2 THEN
    PERFORM create_alert(
      v_venue_id,
      'cost_spike',
      CASE
        WHEN ABS(v_z_score) > 3 THEN 'critical'
        WHEN ABS(v_z_score) > 2.5 THEN 'warning'
        ELSE 'info'
      END,
      CASE
        WHEN v_z_score > 0 THEN 'Invoice Cost Spike: ' || v_item_name
        ELSE 'Invoice Cost Drop: ' || v_item_name
      END,
      format(
        '%s from %s: $%s (was $%s avg). Variance: %s%%, Z-score: %s',
        v_item_name,
        v_vendor_name,
        ROUND(NEW.unit_cost, 2),
        ROUND(v_historical_avg, 2),
        ROUND(v_variance_pct, 1),
        ROUND(v_z_score, 2)
      ),
      jsonb_build_object(
        'invoice_line_id', NEW.id,
        'item_id', NEW.item_id,
        'vendor_name', v_vendor_name,
        'new_cost', NEW.unit_cost,
        'avg_cost', v_historical_avg,
        'std_dev', v_std_dev,
        'z_score', v_z_score,
        'variance_pct', v_variance_pct
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger with the correct column name
CREATE TRIGGER detect_invoice_cost_spike_trigger
  AFTER INSERT OR UPDATE OF unit_cost ON invoice_lines
  FOR EACH ROW
  WHEN (NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0)
  EXECUTE FUNCTION detect_invoice_cost_spike();

COMMENT ON FUNCTION detect_invoice_cost_spike IS 'Detect cost variance >2 standard deviations on invoices using z-score analysis (fixed to use unit_cost column)';
