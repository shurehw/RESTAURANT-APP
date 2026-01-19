-- Add check constraint for density_benchmark
ALTER TABLE proforma_projects DROP CONSTRAINT IF EXISTS proforma_projects_density_benchmark_check;
ALTER TABLE proforma_projects ADD CONSTRAINT proforma_projects_density_benchmark_check 
  CHECK (density_benchmark IN ('fast-casual','casual-dining','premium-casual','fine-dining','bar-lounge','nightclub'));
