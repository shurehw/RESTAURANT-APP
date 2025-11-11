/**
 * Migration 039: Variance and Exceptions Views
 * Purpose: Real-time variance tracking and exception-first reporting
 * Views: daily_variance, operational_exceptions
 */

-- Daily Variance: Compare actual performance vs budget
CREATE OR REPLACE VIEW daily_variance AS
SELECT
  dp.venue_id,
  dp.venue_name,
  dp.business_date,

  -- Sales Variance
  dp.gross_sales as actual_sales,
  db.sales_budget as budget_sales,
  (dp.gross_sales - db.sales_budget) as sales_variance,
  CASE
    WHEN db.sales_budget > 0 THEN
      ((dp.gross_sales - db.sales_budget) / db.sales_budget) * 100
    ELSE NULL
  END as sales_variance_pct,
  CASE
    WHEN db.sales_budget = 0 THEN 'no_budget'
    WHEN ABS((dp.gross_sales - db.sales_budget) / db.sales_budget) > 0.15 THEN 'critical'
    WHEN ABS((dp.gross_sales - db.sales_budget) / db.sales_budget) > 0.08 THEN 'warning'
    ELSE 'normal'
  END as sales_status,

  -- COGS Variance
  dp.cogs_pct as actual_cogs_pct,
  db.cogs_budget_pct as budget_cogs_pct,
  (dp.cogs_pct - db.cogs_budget_pct) as cogs_variance_pct,
  CASE
    WHEN db.cogs_budget_pct = 0 THEN 'no_budget'
    WHEN (dp.cogs_pct - db.cogs_budget_pct) > 3 THEN 'critical'
    WHEN (dp.cogs_pct - db.cogs_budget_pct) > 1.5 THEN 'warning'
    ELSE 'normal'
  END as cogs_status,

  -- Labor Variance
  dp.labor_cost as actual_labor_cost,
  db.labor_budget as budget_labor_cost,
  (dp.labor_cost - db.labor_budget) as labor_variance,
  CASE
    WHEN db.labor_budget > 0 THEN
      ((dp.labor_cost - db.labor_budget) / db.labor_budget) * 100
    ELSE NULL
  END as labor_variance_pct,
  CASE
    WHEN db.labor_budget = 0 THEN 'no_budget'
    WHEN ((dp.labor_cost - db.labor_budget) / NULLIF(db.labor_budget, 0)) > 0.10 THEN 'critical'
    WHEN ((dp.labor_cost - db.labor_budget) / NULLIF(db.labor_budget, 0)) > 0.05 THEN 'warning'
    ELSE 'normal'
  END as labor_status,

  -- Prime Cost Variance
  dp.prime_cost_pct as actual_prime_cost_pct,
  db.prime_cost_budget_pct as budget_prime_cost_pct,
  (dp.prime_cost_pct - db.prime_cost_budget_pct) as prime_cost_variance_pct,
  CASE
    WHEN db.prime_cost_budget_pct = 0 THEN 'no_budget'
    WHEN (dp.prime_cost_pct - db.prime_cost_budget_pct) > 5 THEN 'critical'
    WHEN (dp.prime_cost_pct - db.prime_cost_budget_pct) > 2 THEN 'warning'
    ELSE 'normal'
  END as prime_cost_status,

  -- Overall Status (worst of all categories)
  CASE
    WHEN 'critical' IN (
      CASE WHEN ABS((dp.gross_sales - db.sales_budget) / NULLIF(db.sales_budget, 0)) > 0.15 THEN 'critical' ELSE 'ok' END,
      CASE WHEN (dp.cogs_pct - db.cogs_budget_pct) > 3 THEN 'critical' ELSE 'ok' END,
      CASE WHEN ((dp.labor_cost - db.labor_budget) / NULLIF(db.labor_budget, 0)) > 0.10 THEN 'critical' ELSE 'ok' END,
      CASE WHEN (dp.prime_cost_pct - db.prime_cost_budget_pct) > 5 THEN 'critical' ELSE 'ok' END
    ) THEN 'critical'
    WHEN 'warning' IN (
      CASE WHEN ABS((dp.gross_sales - db.sales_budget) / NULLIF(db.sales_budget, 0)) > 0.08 THEN 'warning' ELSE 'ok' END,
      CASE WHEN (dp.cogs_pct - db.cogs_budget_pct) > 1.5 THEN 'warning' ELSE 'ok' END,
      CASE WHEN ((dp.labor_cost - db.labor_budget) / NULLIF(db.labor_budget, 0)) > 0.05 THEN 'warning' ELSE 'ok' END,
      CASE WHEN (dp.prime_cost_pct - db.prime_cost_budget_pct) > 2 THEN 'warning' ELSE 'ok' END
    ) THEN 'warning'
    ELSE 'normal'
  END as overall_status,

  dp.transaction_count,
  dp.labor_hours,
  dp.sales_per_labor_hour,
  dp.last_refreshed_at

FROM daily_performance dp
LEFT JOIN daily_budgets db ON dp.venue_id = db.venue_id
  AND dp.business_date = db.business_date
ORDER BY dp.business_date DESC, dp.venue_name;

-- Operational Exceptions: Exception-first view showing only items requiring attention
CREATE OR REPLACE VIEW operational_exceptions AS
-- Labor Over Budget
SELECT
  'labor_overage'::TEXT as exception_type,
  dv.venue_id,
  dv.venue_name,
  dv.business_date,
  'critical'::TEXT as severity,
  format('Labor %s%% over budget', ROUND(dv.labor_variance_pct, 1)) as title,
  format('Labor cost: $%s (budget: $%s). Variance: $%s (%s%%)',
    ROUND(dv.actual_labor_cost, 2),
    ROUND(dv.budget_labor_cost, 2),
    ROUND(dv.labor_variance, 2),
    ROUND(dv.labor_variance_pct, 1)
  ) as description,
  jsonb_build_object(
    'actual', dv.actual_labor_cost,
    'budget', dv.budget_labor_cost,
    'variance', dv.labor_variance,
    'variance_pct', dv.labor_variance_pct
  ) as metadata
FROM daily_variance dv
WHERE dv.labor_status IN ('critical', 'warning')
  AND dv.business_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

-- COGS High
SELECT
  'cogs_high'::TEXT,
  dv.venue_id,
  dv.venue_name,
  dv.business_date,
  dv.cogs_status::TEXT,
  format('COGS %s%% over budget', ROUND(dv.cogs_variance_pct, 1)),
  format('COGS: %s%% (budget: %s%%). Variance: %s%%',
    ROUND(dv.actual_cogs_pct, 1),
    ROUND(dv.budget_cogs_pct, 1),
    ROUND(dv.cogs_variance_pct, 1)
  ),
  jsonb_build_object(
    'actual_pct', dv.actual_cogs_pct,
    'budget_pct', dv.budget_cogs_pct,
    'variance_pct', dv.cogs_variance_pct
  )
FROM daily_variance dv
WHERE dv.cogs_status IN ('critical', 'warning')
  AND dv.business_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

-- Sales Low
SELECT
  'sales_low'::TEXT,
  dv.venue_id,
  dv.venue_name,
  dv.business_date,
  dv.sales_status::TEXT,
  format('Sales %s%% under budget', ROUND(ABS(dv.sales_variance_pct), 1)),
  format('Sales: $%s (budget: $%s). Variance: $%s (%s%%)',
    ROUND(dv.actual_sales, 2),
    ROUND(dv.budget_sales, 2),
    ROUND(dv.sales_variance, 2),
    ROUND(dv.sales_variance_pct, 1)
  ),
  jsonb_build_object(
    'actual', dv.actual_sales,
    'budget', dv.budget_sales,
    'variance', dv.sales_variance,
    'variance_pct', dv.sales_variance_pct
  )
FROM daily_variance dv
WHERE dv.sales_status IN ('critical', 'warning')
  AND dv.sales_variance < 0 -- Only under budget
  AND dv.business_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

-- Prime Cost High
SELECT
  'prime_cost_high'::TEXT,
  dv.venue_id,
  dv.venue_name,
  dv.business_date,
  dv.prime_cost_status::TEXT,
  format('Prime Cost %s%% over budget', ROUND(dv.prime_cost_variance_pct, 1)),
  format('Prime Cost: %s%% (budget: %s%%). Variance: %s%%',
    ROUND(dv.actual_prime_cost_pct, 1),
    ROUND(dv.budget_prime_cost_pct, 1),
    ROUND(dv.prime_cost_variance_pct, 1)
  ),
  jsonb_build_object(
    'actual_pct', dv.actual_prime_cost_pct,
    'budget_pct', dv.budget_prime_cost_pct,
    'variance_pct', dv.prime_cost_variance_pct
  )
FROM daily_variance dv
WHERE dv.prime_cost_status IN ('critical', 'warning')
  AND dv.business_date >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

-- Low Stock Items
SELECT
  'low_stock'::TEXT,
  ibr.venue_id,
  ibr.venue_name,
  CURRENT_DATE,
  CASE
    WHEN ibr.quantity_on_hand <= ibr.reorder_point * 0.5 THEN 'critical'
    ELSE 'warning'
  END::TEXT,
  format('%s at %s on-hand', ibr.item_name, ROUND(ibr.quantity_on_hand, 1)),
  format('Item: %s (SKU: %s). On-hand: %s, Reorder point: %s, Par: %s',
    ibr.item_name,
    ibr.sku,
    ROUND(ibr.quantity_on_hand, 1),
    ROUND(ibr.reorder_point, 1),
    ROUND(ibr.par_level, 1)
  ),
  jsonb_build_object(
    'item_id', ibr.item_id,
    'sku', ibr.sku,
    'quantity_on_hand', ibr.quantity_on_hand,
    'reorder_point', ibr.reorder_point,
    'reorder_quantity', ibr.reorder_quantity,
    'estimated_cost', ibr.estimated_order_cost
  )
FROM items_below_reorder ibr

UNION ALL

-- Pending Invoice Approvals
SELECT
  'pending_approval'::TEXT,
  i.venue_id,
  v.name,
  i.invoice_date::DATE,
  CASE
    WHEN i.variance_severity = 'critical' THEN 'critical'
    ELSE 'warning'
  END::TEXT,
  format('Invoice %s pending approval', i.invoice_number),
  format('Vendor: %s. Amount: $%s. Variance: %s%% (%s)',
    vnd.name,
    ROUND(i.total_amount, 2),
    ROUND(i.total_variance_pct, 1),
    i.variance_severity
  ),
  jsonb_build_object(
    'invoice_id', i.id,
    'invoice_number', i.invoice_number,
    'vendor_id', i.vendor_id,
    'total_amount', i.total_amount,
    'variance_pct', i.total_variance_pct,
    'variance_severity', i.variance_severity
  )
FROM invoices i
JOIN venues v ON i.venue_id = v.id
JOIN vendors vnd ON i.vendor_id = vnd.id
WHERE i.status = 'pending'
  AND i.auto_approved = false
  AND i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'

ORDER BY business_date DESC, severity DESC, exception_type;

COMMENT ON VIEW daily_variance IS 'Real-time variance tracking: actual vs budget with severity levels';
COMMENT ON VIEW operational_exceptions IS 'Exception-first view: only items requiring operator attention';
