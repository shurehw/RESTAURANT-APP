-- Table combos: allow re-combining the same primary table after release.
-- Replace strict table-level unique constraint with an active-only unique index.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'table_combos'
      AND constraint_name = 'table_combos_venue_id_business_date_primary_table_id_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE table_combos
      DROP CONSTRAINT table_combos_venue_id_business_date_primary_table_id_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_table_combos_primary_active
  ON table_combos (venue_id, business_date, primary_table_id)
  WHERE status = 'active';
