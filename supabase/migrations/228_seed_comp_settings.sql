-- Seed default comp settings for organizations
-- Eliminates "No settings found" empty state

-- Insert default comp settings for h.wood Group
-- This uses the default values from the schema but makes them explicit
INSERT INTO comp_settings (
  org_id,
  version,
  approved_reasons,
  high_value_comp_threshold,
  high_comp_pct_threshold,
  daily_comp_pct_warning,
  daily_comp_pct_critical,
  server_max_comp_amount,
  manager_min_for_high_value,
  manager_roles,
  ai_model,
  ai_max_tokens,
  ai_temperature,
  is_active,
  effective_from
)
SELECT
  o.id as org_id,
  1 as version,
  '[
    {"name": "Drink Tickets", "requires_manager_approval": false, "max_amount": null},
    {"name": "Promoter / Customer Development", "requires_manager_approval": true, "max_amount": null},
    {"name": "Guest Recovery", "requires_manager_approval": false, "max_amount": 100},
    {"name": "Black Card", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 10%", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 20%", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 25%", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 30%", "requires_manager_approval": false, "max_amount": null},
    {"name": "Staff Discount 50%", "requires_manager_approval": true, "max_amount": null},
    {"name": "Executive/Partner Comps", "requires_manager_approval": true, "max_amount": null},
    {"name": "Goodwill", "requires_manager_approval": false, "max_amount": 75},
    {"name": "DNL (Did Not Like)", "requires_manager_approval": false, "max_amount": 50},
    {"name": "Spill / Broken items", "requires_manager_approval": false, "max_amount": 50},
    {"name": "FOH Mistake", "requires_manager_approval": false, "max_amount": 75},
    {"name": "BOH Mistake / Wrong Temp", "requires_manager_approval": false, "max_amount": 75},
    {"name": "Barbuy", "requires_manager_approval": true, "max_amount": null},
    {"name": "Performer / Band / DJ", "requires_manager_approval": true, "max_amount": null},
    {"name": "Media / PR / Celebrity", "requires_manager_approval": true, "max_amount": null},
    {"name": "Manager Meal", "requires_manager_approval": false, "max_amount": 30}
  ]'::JSONB as approved_reasons,
  200.00 as high_value_comp_threshold,
  50.00 as high_comp_pct_threshold,
  2.00 as daily_comp_pct_warning,
  3.00 as daily_comp_pct_critical,
  50.00 as server_max_comp_amount,
  200.00 as manager_min_for_high_value,
  '["Manager", "General Manager", "Assistant Manager", "AGM", "GM"]'::JSONB as manager_roles,
  'claude-sonnet-4-5-20250929' as ai_model,
  4000 as ai_max_tokens,
  0.30 as ai_temperature,
  true as is_active,
  NOW() as effective_from
FROM organizations o
WHERE NOT EXISTS (
  -- Only insert if no settings exist for this org
  SELECT 1 FROM comp_settings cs WHERE cs.org_id = o.id
)
LIMIT 1; -- Safety: only seed one org at a time

-- Verify the insert
DO $$
DECLARE
  settings_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO settings_count FROM comp_settings;

  IF settings_count > 0 THEN
    RAISE NOTICE 'Successfully seeded comp settings for % organization(s)', settings_count;
  ELSE
    RAISE NOTICE 'No organizations found to seed comp settings';
  END IF;
END $$;
