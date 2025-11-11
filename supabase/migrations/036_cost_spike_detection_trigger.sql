/**
 * Migration 036: Cost Spike Detection Trigger
 * Purpose: Detect and alert on price variance >2 standard deviations using z-score analysis
 */

-- Function to detect cost spikes on receipt lines
CREATE OR REPLACE FUNCTION detect_cost_spike()
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
  -- Only check if unit_cost is provided
  IF NEW.unit_cost IS NULL OR NEW.unit_cost = 0 THEN
    RETURN NEW;
  END IF;

  -- Get venue_id and vendor info from receipt
  SELECT r.venue_id, v.name, r.vendor_id
  INTO v_venue_id, v_vendor_name, NEW.receipt_id
  FROM receipts r
  JOIN vendors v ON r.vendor_id = v.id
  WHERE r.id = NEW.receipt_id;

  -- Get item name
  SELECT name INTO v_item_name FROM items WHERE id = NEW.item_id;

  -- Calculate 90-day historical average and standard deviation
  SELECT
    AVG(rl.unit_cost),
    STDDEV(rl.unit_cost)
  INTO v_historical_avg, v_std_dev
  FROM receipt_lines rl
  JOIN receipts r ON rl.receipt_id = r.id
  WHERE rl.item_id = NEW.item_id
    AND rl.unit_cost IS NOT NULL
    AND rl.unit_cost > 0
    AND rl.created_at > NOW() - INTERVAL '90 days'
    AND rl.id != NEW.id; -- Exclude current record

  -- Need at least 5 historical records for meaningful analysis
  IF v_historical_avg IS NULL OR v_std_dev IS NULL OR v_std_dev = 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate z-score (how many std deviations from mean)
  v_z_score := (NEW.unit_cost - v_historical_avg) / v_std_dev;
  v_variance_pct := ((NEW.unit_cost - v_historical_avg) / v_historical_avg) * 100;

  -- Alert if z-score > 2 (95% confidence interval)
  IF ABS(v_z_score) > 2 THEN
    -- Determine severity based on z-score
    PERFORM create_alert(
      v_venue_id,
      'cost_spike',
      CASE
        WHEN ABS(v_z_score) > 3 THEN 'critical'
        WHEN ABS(v_z_score) > 2.5 THEN 'warning'
        ELSE 'info'
      END,
      CASE
        WHEN v_z_score > 0 THEN 'Cost Spike Detected: ' || v_item_name
        ELSE 'Cost Drop Detected: ' || v_item_name
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
        'receipt_line_id', NEW.id,
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

-- Create trigger on receipt_lines
CREATE TRIGGER detect_cost_spike_trigger
  AFTER INSERT OR UPDATE OF unit_cost ON receipt_lines
  FOR EACH ROW
  WHEN (NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0)
  EXECUTE FUNCTION detect_cost_spike();

-- Similarly, check invoice lines for cost spikes
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
  -- Only check if unit_price is provided
  IF NEW.unit_price IS NULL OR NEW.unit_price = 0 THEN
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
    AVG(il.unit_price),
    STDDEV(il.unit_price)
  INTO v_historical_avg, v_std_dev
  FROM invoice_lines il
  JOIN invoices i ON il.invoice_id = i.id
  WHERE il.item_id = NEW.item_id
    AND il.unit_price IS NOT NULL
    AND il.unit_price > 0
    AND il.created_at > NOW() - INTERVAL '90 days'
    AND il.id != NEW.id;

  -- Need at least 5 historical records
  IF v_historical_avg IS NULL OR v_std_dev IS NULL OR v_std_dev = 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate z-score
  v_z_score := (NEW.unit_price - v_historical_avg) / v_std_dev;
  v_variance_pct := ((NEW.unit_price - v_historical_avg) / v_historical_avg) * 100;

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
        ROUND(NEW.unit_price, 2),
        ROUND(v_historical_avg, 2),
        ROUND(v_variance_pct, 1),
        ROUND(v_z_score, 2)
      ),
      jsonb_build_object(
        'invoice_line_id', NEW.id,
        'item_id', NEW.item_id,
        'vendor_name', v_vendor_name,
        'new_cost', NEW.unit_price,
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

-- Create trigger on invoice_lines
CREATE TRIGGER detect_invoice_cost_spike_trigger
  AFTER INSERT OR UPDATE OF unit_price ON invoice_lines
  FOR EACH ROW
  WHEN (NEW.unit_price IS NOT NULL AND NEW.unit_price > 0)
  EXECUTE FUNCTION detect_invoice_cost_spike();

COMMENT ON FUNCTION detect_cost_spike IS 'Detect cost variance >2 standard deviations on receipts using z-score analysis';
COMMENT ON FUNCTION detect_invoice_cost_spike IS 'Detect cost variance >2 standard deviations on invoices using z-score analysis';
