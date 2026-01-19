-- Update old concept_type values to new ones
UPDATE proforma_projects SET concept_type = 'casual-dining' WHERE concept_type = 'fsr';
UPDATE proforma_projects SET concept_type = 'nightclub' WHERE concept_type = 'nightlife';

-- Now drop and recreate the constraints
ALTER TABLE proforma_projects DROP CONSTRAINT IF EXISTS proforma_projects_concept_type_check;
ALTER TABLE proforma_projects ADD CONSTRAINT proforma_projects_concept_type_check
  CHECK (concept_type IN ('fast-casual','casual-dining','premium-casual','fine-dining','bar-lounge','nightclub'));

-- Add check constraint for density_benchmark (allow NULL)
ALTER TABLE proforma_projects DROP CONSTRAINT IF EXISTS proforma_projects_density_benchmark_check;
ALTER TABLE proforma_projects ADD CONSTRAINT proforma_projects_density_benchmark_check 
  CHECK (density_benchmark IS NULL OR density_benchmark IN ('fast-casual','casual-dining','premium-casual','fine-dining','bar-lounge','nightclub'));
