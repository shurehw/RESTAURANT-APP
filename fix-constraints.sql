-- Drop and recreate the concept_type check constraint
ALTER TABLE proforma_projects DROP CONSTRAINT IF EXISTS proforma_projects_concept_type_check;
ALTER TABLE proforma_projects ADD CONSTRAINT proforma_projects_concept_type_check
  CHECK (concept_type IN ('fast-casual','casual-dining','premium-casual','fine-dining','bar-lounge','nightclub'));

-- Add check constraint for density_benchmark if it doesn't exist
ALTER TABLE proforma_projects DROP CONSTRAINT IF EXISTS proforma_projects_density_benchmark_check;
ALTER TABLE proforma_projects ADD CONSTRAINT proforma_projects_density_benchmark_check 
  CHECK (density_benchmark IN ('fast-casual','casual-dining','premium-casual','fine-dining','bar-lounge','nightclub'));
