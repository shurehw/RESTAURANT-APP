-- Enable RLS on time clock tables (BUG-008)

ALTER TABLE employee_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock_settings ENABLE ROW LEVEL SECURITY;

-- employee_pins policies
CREATE POLICY "Users can view pins for their organization"
  ON employee_pins FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Only managers can generate pins"
  ON employee_pins FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
        AND v.id = venue_id
    )
  );

CREATE POLICY "Only managers can update pins"
  ON employee_pins FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
        AND v.id = venue_id
    )
  );

-- employee_breaks policies
-- All users in organization can view breaks (for managers to monitor compliance)
CREATE POLICY "Users can view breaks in their organization"
  ON employee_breaks FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

-- All users in organization can create breaks (employees clock in/out via API)
-- API layer validates the employee_id matches the authenticated user
CREATE POLICY "Users can create breaks in their organization"
  ON employee_breaks FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

-- All users in organization can update breaks (to end breaks)
CREATE POLICY "Users can update breaks in their organization"
  ON employee_breaks FOR UPDATE
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

-- schedule_templates policies
CREATE POLICY "Users can view templates in their organization"
  ON schedule_templates FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can create templates"
  ON schedule_templates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
        AND v.id = venue_id
    )
  );

CREATE POLICY "Managers can update templates"
  ON schedule_templates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
        AND v.id = venue_id
    )
  );

CREATE POLICY "Managers can delete templates"
  ON schedule_templates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
        AND v.id = venue_id
    )
  );

-- time_clock_settings policies
CREATE POLICY "Users can view settings for their organization"
  ON time_clock_settings FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Only admins can update clock settings"
  ON time_clock_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin')
        AND v.id = venue_id
    )
  );

CREATE POLICY "Only admins can create clock settings"
  ON time_clock_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin')
        AND v.id = venue_id
    )
  );
