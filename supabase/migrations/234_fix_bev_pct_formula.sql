-- Fix bev_pct generated column: use category totals as denominator
-- instead of gross_sales (which is check-level, after comps/voids).
-- beverage_sales and food_sales are both item-level (before comps),
-- so dividing by their sum gives the correct category mix percentage.

ALTER TABLE sales_snapshots
  DROP COLUMN bev_pct;

ALTER TABLE sales_snapshots
  ADD COLUMN bev_pct NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN (food_sales + beverage_sales) > 0
      THEN beverage_sales / (food_sales + beverage_sales) * 100
      ELSE NULL
    END
  ) STORED;
