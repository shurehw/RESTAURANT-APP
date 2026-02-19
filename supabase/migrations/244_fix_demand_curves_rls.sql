-- Fix: infinite recursion in demand_distribution_curves RLS policy
--
-- The original policy (migration 243) used an inline subquery through
-- organization_users, which triggers RLS recursion. Replace with the
-- established get_user_venue_ids() SECURITY DEFINER helper (migration 166).
--
-- Also mark get_interval_forecasts() as SECURITY DEFINER since the API
-- endpoint already validates venue access via assertVenueAccess().

-- 1. Replace RLS policy
DROP POLICY IF EXISTS "Users can view distribution curves for their venues"
  ON demand_distribution_curves;

CREATE POLICY "Users can view distribution curves for their venues"
  ON demand_distribution_curves FOR SELECT
  USING (venue_id IN (SELECT get_user_venue_ids()));

-- 2. Make function SECURITY DEFINER (bypasses RLS on joined tables)
CREATE OR REPLACE FUNCTION get_interval_forecasts(
  p_venue_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  business_date DATE,
  day_type TEXT,
  interval_start TIME,
  covers_predicted INTEGER,
  revenue_predicted NUMERIC,
  pct_of_daily NUMERIC,
  daily_total_covers INTEGER,
  daily_total_revenue NUMERIC,
  sample_size INTEGER
)
AS $$
  SELECT
    f.business_date,
    f.day_type::text,
    c.interval_start,
    ROUND(f.covers_predicted * c.pct_of_daily_covers)::integer AS covers_predicted,
    ROUND(f.revenue_predicted * c.pct_of_daily_revenue, 2) AS revenue_predicted,
    c.pct_of_daily_covers AS pct_of_daily,
    f.covers_predicted::integer AS daily_total_covers,
    f.revenue_predicted AS daily_total_revenue,
    c.sample_size
  FROM forecasts_with_bias f
  JOIN demand_distribution_curves c
    ON c.venue_id = f.venue_id
   AND c.day_type::text = f.day_type::text
  WHERE f.venue_id = p_venue_id
    AND f.business_date BETWEEN p_start_date AND p_end_date
    AND f.covers_predicted > 0
  ORDER BY f.business_date, c.interval_start;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
