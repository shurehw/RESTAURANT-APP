-- Create service_period_covers records for Lunch
-- This calculates: Seats × Turns × Utilization

-- First, let's see what we're working with
SELECT
  sp.service_name,
  sp.service_hours,
  sp.avg_dining_time_hours,
  sp.service_hours / NULLIF(sp.avg_dining_time_hours, 0) as turns,
  rc.center_name,
  rc.seats,
  p.utilization_pct,
  -- Calculate covers: seats × turns × (utilization / 100)
  rc.seats * (sp.service_hours / NULLIF(sp.avg_dining_time_hours, 0)) * (p.utilization_pct / 100.0) as calculated_covers
FROM proforma_center_service_participation p
JOIN proforma_revenue_service_periods sp ON sp.id = p.service_period_id
JOIN proforma_revenue_centers rc ON rc.id = p.revenue_center_id
WHERE sp.service_name = 'Lunch'
  AND p.is_active = true
ORDER BY rc.center_name;

-- Now insert or update the service_period_covers records
INSERT INTO proforma_service_period_covers (
  service_period_id,
  revenue_center_id,
  covers_per_service,
  is_manually_edited
)
SELECT
  sp.id as service_period_id,
  rc.id as revenue_center_id,
  ROUND(
    rc.seats *
    (sp.service_hours / NULLIF(sp.avg_dining_time_hours, 0)) *
    (p.utilization_pct / 100.0),
    1
  ) as covers_per_service,
  false as is_manually_edited
FROM proforma_center_service_participation p
JOIN proforma_revenue_service_periods sp ON sp.id = p.service_period_id
JOIN proforma_revenue_centers rc ON rc.id = p.revenue_center_id
WHERE sp.service_name = 'Lunch'
  AND p.is_active = true
  AND rc.is_bar = false  -- Regular dining centers only (bar and PDR use different calculations)
  AND (rc.is_pdr IS NULL OR rc.is_pdr = false)
ON CONFLICT (service_period_id, revenue_center_id)
DO UPDATE SET
  covers_per_service = EXCLUDED.covers_per_service,
  is_manually_edited = false;

-- Verify the results
SELECT
  sp.service_name,
  rc.center_name,
  spc.covers_per_service
FROM proforma_service_period_covers spc
JOIN proforma_revenue_service_periods sp ON sp.id = spc.service_period_id
JOIN proforma_revenue_centers rc ON rc.id = spc.revenue_center_id
WHERE sp.service_name = 'Lunch'
ORDER BY rc.center_name;
