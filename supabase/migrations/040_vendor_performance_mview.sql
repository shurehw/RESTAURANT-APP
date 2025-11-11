/**
 * Migration 040: Vendor Performance Materialized View
 * Purpose: Track vendor reliability, cost trends, and quality metrics
 * Refresh: Daily at 6am via pg_cron
 */

-- Vendor Performance: Comprehensive vendor scorecard
CREATE MATERIALIZED VIEW IF NOT EXISTS vendor_performance AS
SELECT
  v.id as vendor_id,
  v.name as vendor_name,
  v.category as vendor_category,

  -- Order Metrics (last 90 days)
  COUNT(DISTINCT po.id) as order_count,
  SUM(po.total_amount) as total_spend,
  AVG(po.total_amount) as avg_order_value,

  -- Receipt Metrics
  COUNT(DISTINCT r.id) as receipt_count,
  COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END) as completed_receipts,
  CASE
    WHEN COUNT(DISTINCT r.id) > 0 THEN
      (COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END)::FLOAT / COUNT(DISTINCT r.id)) * 100
    ELSE NULL
  END as completion_rate,

  -- On-Time Delivery
  COUNT(DISTINCT CASE
    WHEN r.received_at IS NOT NULL
      AND po.delivery_date IS NOT NULL
      AND r.received_at::DATE <= po.delivery_date
    THEN r.id
  END) as on_time_deliveries,
  COUNT(DISTINCT CASE
    WHEN r.received_at IS NOT NULL
      AND po.delivery_date IS NOT NULL
    THEN r.id
  END) as deliveries_with_date,
  CASE
    WHEN COUNT(DISTINCT CASE WHEN r.received_at IS NOT NULL AND po.delivery_date IS NOT NULL THEN r.id END) > 0 THEN
      (COUNT(DISTINCT CASE WHEN r.received_at::DATE <= po.delivery_date THEN r.id END)::FLOAT /
       COUNT(DISTINCT CASE WHEN r.received_at IS NOT NULL AND po.delivery_date IS NOT NULL THEN r.id END)) * 100
    ELSE NULL
  END as on_time_rate,

  -- Invoice Metrics
  COUNT(DISTINCT inv.id) as invoice_count,
  COUNT(DISTINCT CASE WHEN inv.status = 'approved' THEN inv.id END) as approved_invoices,
  COUNT(DISTINCT CASE WHEN inv.auto_approved = true THEN inv.id END) as auto_approved_invoices,
  COUNT(DISTINCT CASE WHEN inv.variance_severity = 'critical' THEN inv.id END) as critical_variance_count,

  -- Average Invoice Match Quality
  AVG(CASE WHEN inv.match_confidence IS NOT NULL THEN inv.match_confidence ELSE NULL END) as avg_match_confidence,
  AVG(CASE WHEN inv.total_variance_pct IS NOT NULL THEN ABS(inv.total_variance_pct) ELSE NULL END) as avg_variance_pct,

  -- Cost Spike Alerts
  COUNT(DISTINCT a.id) FILTER (WHERE a.alert_type = 'cost_spike') as cost_spike_count,

  -- Item Coverage
  COUNT(DISTINCT rl.item_id) as unique_items_supplied,

  -- Average Lead Time (days from order to receipt)
  AVG(
    EXTRACT(EPOCH FROM (r.received_at - po.order_date)) / 86400
  ) as avg_lead_time_days,

  -- Last Activity
  MAX(po.order_date) as last_order_date,
  MAX(r.received_at) as last_receipt_date,
  MAX(inv.invoice_date) as last_invoice_date,

  -- Vendor Score (0-100)
  -- Weighted: 40% on-time, 30% auto-approve rate, 20% low variance, 10% completion
  CASE
    WHEN COUNT(DISTINCT r.id) >= 5 THEN -- Need at least 5 receipts for meaningful score
      COALESCE(
        (
          -- On-time delivery (40 points)
          (CASE
            WHEN COUNT(DISTINCT CASE WHEN r.received_at IS NOT NULL AND po.delivery_date IS NOT NULL THEN r.id END) > 0
            THEN (COUNT(DISTINCT CASE WHEN r.received_at::DATE <= po.delivery_date THEN r.id END)::FLOAT /
                  COUNT(DISTINCT CASE WHEN r.received_at IS NOT NULL AND po.delivery_date IS NOT NULL THEN r.id END)) * 40
            ELSE 20
          END) +

          -- Auto-approve rate (30 points)
          (CASE
            WHEN COUNT(DISTINCT inv.id) > 0
            THEN (COUNT(DISTINCT CASE WHEN inv.auto_approved = true THEN inv.id END)::FLOAT / COUNT(DISTINCT inv.id)) * 30
            ELSE 15
          END) +

          -- Low variance rate (20 points)
          (CASE
            WHEN COUNT(DISTINCT inv.id) > 0
            THEN (1 - (COUNT(DISTINCT CASE WHEN inv.variance_severity IN ('warning', 'critical') THEN inv.id END)::FLOAT / COUNT(DISTINCT inv.id))) * 20
            ELSE 10
          END) +

          -- Completion rate (10 points)
          (CASE
            WHEN COUNT(DISTINCT r.id) > 0
            THEN (COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END)::FLOAT / COUNT(DISTINCT r.id)) * 10
            ELSE 5
          END)
        ),
        50 -- Default score if no data
      )
    ELSE NULL
  END as vendor_score,

  NOW() as last_refreshed_at

FROM vendors v
LEFT JOIN purchase_orders po ON po.vendor_id = v.id
  AND po.order_date >= CURRENT_DATE - INTERVAL '90 days'
LEFT JOIN receipts r ON r.purchase_order_id = po.id
LEFT JOIN invoices inv ON inv.vendor_id = v.id
  AND inv.invoice_date >= CURRENT_DATE - INTERVAL '90 days'
LEFT JOIN receipt_lines rl ON rl.receipt_id = r.id
LEFT JOIN alerts a ON a.metadata->>'vendor_name' = v.name
  AND a.alert_type = 'cost_spike'
  AND a.created_at >= CURRENT_DATE - INTERVAL '90 days'
WHERE v.is_active = true
GROUP BY v.id, v.name, v.category;

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_performance_vendor_id
  ON vendor_performance(vendor_id);

CREATE INDEX IF NOT EXISTS idx_vendor_performance_score
  ON vendor_performance(vendor_score DESC NULLS LAST)
  WHERE vendor_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_performance_category
  ON vendor_performance(vendor_category);

-- Function to refresh vendor performance
CREATE OR REPLACE FUNCTION refresh_vendor_performance()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY vendor_performance;
END;
$$ LANGUAGE plpgsql;

COMMENT ON MATERIALIZED VIEW vendor_performance IS 'Vendor scorecard: reliability, cost trends, quality metrics. Refreshed daily at 6am.';
COMMENT ON FUNCTION refresh_vendor_performance IS 'Refresh vendor performance materialized view';
