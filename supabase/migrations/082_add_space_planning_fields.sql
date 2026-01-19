-- Add space planning fields to proforma_projects if they don't exist

DO $$
BEGIN
  -- Add density_benchmark if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'density_benchmark'
  ) THEN
    ALTER TABLE proforma_projects
    ADD COLUMN density_benchmark text CHECK (density_benchmark IN (
      'fast-casual','casual-dining','premium-casual','fine-dining','bar-lounge','nightclub'
    ));
  END IF;

  -- Add total_sf if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'total_sf'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN total_sf int;
  END IF;

  -- Add sf_per_seat if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'sf_per_seat'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN sf_per_seat numeric(6,2);
  END IF;

  -- Add dining_area_pct if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'dining_area_pct'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN dining_area_pct numeric(5,2);
  END IF;

  -- Add boh_pct if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'boh_pct'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN boh_pct numeric(5,2);
  END IF;

  -- Add monthly_rent if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'monthly_rent'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN monthly_rent numeric(12,2);
  END IF;

  -- Add use_manual_seats if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'use_manual_seats'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN use_manual_seats boolean DEFAULT false;
  END IF;

  -- Add manual_seats if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'manual_seats'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN manual_seats int;
  END IF;

  -- Add use_manual_splits if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'use_manual_splits'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN use_manual_splits boolean DEFAULT false;
  END IF;

  -- Add square_feet_foh if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'square_feet_foh'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN square_feet_foh int;
  END IF;

  -- Add square_feet_boh if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'square_feet_boh'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN square_feet_boh int;
  END IF;

  -- Add bar_seats if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_projects' AND column_name = 'bar_seats'
  ) THEN
    ALTER TABLE proforma_projects ADD COLUMN bar_seats int;
  END IF;
END $$;
