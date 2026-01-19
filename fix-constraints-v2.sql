-- First, delete any existing invalid rows (or update them)
-- Check what concept_types exist first
SELECT DISTINCT concept_type FROM proforma_projects;

-- Option 1: Delete invalid rows (if any exist)
-- DELETE FROM proforma_projects WHERE concept_type NOT IN ('fast-casual','casual-dining','premium-casual','fine-dining','bar-lounge','nightclub');

-- Option 2: Or just drop the old constraint and add the new one
ALTER TABLE proforma_projects DROP CONSTRAINT IF EXISTS proforma_projects_concept_type_check;
ALTER TABLE proforma_projects ADD CONSTRAINT proforma_projects_concept_type_check
  CHECK (concept_type IN ('fast-casual','casual-dining','premium-casual','fine-dining','bar-lounge','nightclub'));

-- Add check constraint for density_benchmark
ALTER TABLE proforma_projects DROP CONSTRAINT IF EXISTS proforma_projects_density_benchmark_check;
ALTER TABLE proforma_projects ADD CONSTRAINT proforma_projects_density_benchmark_check 
  CHECK (density_benchmark IS NULL OR density_benchmark IN ('fast-casual','casual-dining','premium-casual','fine-dining','bar-lounge','nightclub'));
