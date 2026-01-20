-- Approval workflow for settings changes
-- Requires manager approval before changes go live

-- 1. Create pending_settings_changes table
CREATE TABLE IF NOT EXISTS pending_settings_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- What table and record
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,

  -- Proposed changes (JSONB diff)
  proposed_changes JSONB NOT NULL,
  change_description TEXT,

  -- Workflow state
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

  -- Who requested
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Who approved/rejected
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Applied timestamp
  applied_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pending_changes_org ON pending_settings_changes(organization_id);
CREATE INDEX idx_pending_changes_status ON pending_settings_changes(status);
CREATE INDEX idx_pending_changes_requested_by ON pending_settings_changes(requested_by);
CREATE INDEX idx_pending_changes_table ON pending_settings_changes(table_name, record_id);

COMMENT ON TABLE pending_settings_changes IS 'Approval workflow: tracks settings changes awaiting manager approval';

-- 2. Function to submit settings change for approval
CREATE OR REPLACE FUNCTION submit_settings_change_for_approval(
  p_organization_id UUID,
  p_table_name TEXT,
  p_record_id UUID,
  p_proposed_changes JSONB,
  p_change_description TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_change_id UUID;
BEGIN
  INSERT INTO pending_settings_changes (
    organization_id,
    table_name,
    record_id,
    proposed_changes,
    change_description,
    requested_by
  ) VALUES (
    p_organization_id,
    p_table_name,
    p_record_id,
    p_proposed_changes,
    p_change_description,
    auth.uid()
  )
  RETURNING id INTO v_change_id;

  RETURN v_change_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION submit_settings_change_for_approval IS 'Submit settings change for manager approval';

-- 3. Function to approve/reject change
CREATE OR REPLACE FUNCTION review_settings_change(
  p_change_id UUID,
  p_approve BOOLEAN,
  p_review_notes TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_change RECORD;
  v_new_status TEXT;
BEGIN
  -- Get the pending change
  SELECT * INTO v_change
  FROM pending_settings_changes
  WHERE id = p_change_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change request not found or already processed';
  END IF;

  v_new_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;

  -- Update the change request
  UPDATE pending_settings_changes
  SET
    status = v_new_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_notes = p_review_notes
  WHERE id = p_change_id;

  -- If approved, apply the changes
  IF p_approve THEN
    -- Apply changes based on table_name
    CASE v_change.table_name
      WHEN 'proforma_settings' THEN
        -- Use the versioning trigger to create new version
        UPDATE proforma_settings
        SET
          default_density_benchmark = COALESCE((v_change.proposed_changes->>'default_density_benchmark')::TEXT, default_density_benchmark),
          default_sf_per_seat = COALESCE((v_change.proposed_changes->>'default_sf_per_seat')::NUMERIC, default_sf_per_seat),
          default_dining_area_pct = COALESCE((v_change.proposed_changes->>'default_dining_area_pct')::NUMERIC, default_dining_area_pct)
          -- Add more fields as needed
        WHERE org_id = v_change.record_id::UUID;

      WHEN 'proforma_concept_benchmarks' THEN
        UPDATE proforma_concept_benchmarks
        SET
          sf_per_seat_min = COALESCE((v_change.proposed_changes->>'sf_per_seat_min')::NUMERIC, sf_per_seat_min),
          sf_per_seat_max = COALESCE((v_change.proposed_changes->>'sf_per_seat_max')::NUMERIC, sf_per_seat_max)
          -- Add more fields as needed
        WHERE id = v_change.record_id;

      ELSE
        RAISE EXCEPTION 'Unsupported table: %', v_change.table_name;
    END CASE;

    -- Mark as applied
    UPDATE pending_settings_changes
    SET applied_at = now()
    WHERE id = p_change_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION review_settings_change IS 'Approve or reject a pending settings change';

-- 4. View for pending approvals dashboard
CREATE OR REPLACE VIEW pending_approvals_dashboard AS
SELECT
  psc.id,
  psc.organization_id,
  o.name as organization_name,
  psc.table_name,
  psc.record_id,
  psc.proposed_changes,
  psc.change_description,
  psc.status,
  psc.requested_by,
  u1.email as requested_by_email,
  psc.requested_at,
  psc.reviewed_by,
  u2.email as reviewed_by_email,
  psc.reviewed_at,
  psc.review_notes,
  psc.applied_at,
  -- Summary stats
  jsonb_array_length(jsonb_object_keys(psc.proposed_changes)::jsonb) as num_changes
FROM pending_settings_changes psc
JOIN organizations o ON o.id = psc.organization_id
LEFT JOIN auth.users u1 ON u1.id = psc.requested_by
LEFT JOIN auth.users u2 ON u2.id = psc.reviewed_by
WHERE psc.status = 'pending'
ORDER BY psc.requested_at DESC;

COMMENT ON VIEW pending_approvals_dashboard IS 'Dashboard view of all pending approval requests';

-- 5. Enable RLS
ALTER TABLE pending_settings_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins full access to pending_settings_changes"
  ON pending_settings_changes FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users access their org pending_settings_changes"
  ON pending_settings_changes FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Users can submit changes for their org"
  ON pending_settings_changes FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- 6. Notification trigger for new approval requests
CREATE OR REPLACE FUNCTION notify_approval_required()
RETURNS TRIGGER AS $$
BEGIN
  -- This would integrate with your notification system
  -- For now, just log it
  RAISE NOTICE 'Approval required: change_id=%, org_id=%, requested_by=%',
    NEW.id, NEW.organization_id, NEW.requested_by;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_on_approval_request
  AFTER INSERT ON pending_settings_changes
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION notify_approval_required();

COMMENT ON TRIGGER notify_on_approval_request ON pending_settings_changes IS 'Notifies managers when approval is required';
