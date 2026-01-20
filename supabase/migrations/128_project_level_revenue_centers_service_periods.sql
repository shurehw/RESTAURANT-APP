-- Create project-level revenue centers and service periods tables
-- These are high-level definitions at the project level (used in wizard)
-- Different from scenario-level proforma_revenue_centers which are detailed models

CREATE TABLE IF NOT EXISTS revenue_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES proforma_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  total_seats INTEGER CHECK (total_seats >= 0),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_centers_project
  ON revenue_centers (project_id);

CREATE TABLE IF NOT EXISTS service_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES proforma_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days_per_week INTEGER CHECK (days_per_week >= 0 AND days_per_week <= 7),
  turns_per_day NUMERIC(5,2) CHECK (turns_per_day >= 0),
  avg_check NUMERIC(10,2) CHECK (avg_check >= 0),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_periods_project
  ON service_periods (project_id);

-- Enable RLS
ALTER TABLE revenue_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_periods ENABLE ROW LEVEL SECURITY;

-- RLS policies for revenue_centers
CREATE POLICY "Users can view revenue centers for their organization's projects"
  ON revenue_centers FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM proforma_projects
      WHERE org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can insert revenue centers for their organization's projects"
  ON revenue_centers FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM proforma_projects
      WHERE org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can update revenue centers for their organization's projects"
  ON revenue_centers FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM proforma_projects
      WHERE org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can delete revenue centers for their organization's projects"
  ON revenue_centers FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM proforma_projects
      WHERE org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

-- RLS policies for service_periods
CREATE POLICY "Users can view service periods for their organization's projects"
  ON service_periods FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM proforma_projects
      WHERE org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can insert service periods for their organization's projects"
  ON service_periods FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM proforma_projects
      WHERE org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can update service periods for their organization's projects"
  ON service_periods FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM proforma_projects
      WHERE org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY "Users can delete service periods for their organization's projects"
  ON service_periods FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM proforma_projects
      WHERE org_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );
