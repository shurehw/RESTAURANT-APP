-- ============================================================================
-- CONTROL PLANE: Manager Actions
-- Tracks AI-generated enforcement actions for accountability
-- ============================================================================

CREATE TABLE IF NOT EXISTS manager_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source context
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  source_report TEXT NOT NULL, -- e.g., 'nightly_2025-02-04'
  source_type TEXT NOT NULL DEFAULT 'ai_comp_review', -- ai_comp_review, manual, exception, etc.

  -- Action details
  priority TEXT NOT NULL CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  category TEXT NOT NULL CHECK (category IN ('violation', 'training', 'process', 'policy', 'positive')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  action TEXT NOT NULL, -- Specific action to take

  -- Assignment
  assigned_to TEXT, -- Manager/employee name
  assigned_role TEXT, -- GM, Manager, etc.

  -- Related data
  related_checks JSONB DEFAULT '[]', -- Array of check IDs
  related_employees JSONB DEFAULT '[]', -- Array of employee names
  metadata JSONB DEFAULT '{}', -- Additional context

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'dismissed', 'escalated')),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by TEXT,
  completion_notes TEXT,

  -- Escalation
  escalated_at TIMESTAMP WITH TIME ZONE,
  escalated_to TEXT, -- Who it was escalated to
  escalation_reason TEXT,

  -- Auto-expiry
  expires_at TIMESTAMP WITH TIME ZONE, -- Auto-dismiss after this date for low-priority items

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_manager_actions_venue_date ON manager_actions(venue_id, business_date DESC);
CREATE INDEX idx_manager_actions_assigned_to ON manager_actions(assigned_to, status);
CREATE INDEX idx_manager_actions_status ON manager_actions(status, priority);
CREATE INDEX idx_manager_actions_created ON manager_actions(created_at DESC);

-- RLS Policies
ALTER TABLE manager_actions ENABLE ROW LEVEL SECURITY;

-- Users can see actions for their venues
CREATE POLICY "Users can view actions for their venues"
  ON manager_actions
  FOR SELECT
  USING (
    venue_id IN (
      SELECT venue_id FROM venue_access WHERE user_id = auth.uid()
    )
  );

-- Users can update actions for their venues
CREATE POLICY "Users can update actions for their venues"
  ON manager_actions
  FOR UPDATE
  USING (
    venue_id IN (
      SELECT venue_id FROM venue_access WHERE user_id = auth.uid()
    )
  );

-- Users can insert actions for their venues
CREATE POLICY "Users can create actions for their venues"
  ON manager_actions
  FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM venue_access WHERE user_id = auth.uid()
    )
  );

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_manager_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_manager_actions_updated_at
  BEFORE UPDATE ON manager_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_manager_actions_updated_at();

-- View for active actions (pending or in-progress, not expired)
CREATE OR REPLACE VIEW active_manager_actions AS
SELECT *
FROM manager_actions
WHERE status IN ('pending', 'in_progress')
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY
  CASE priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  created_at DESC;

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE ON manager_actions TO authenticated;
GRANT SELECT ON active_manager_actions TO authenticated;

SELECT 'Control Plane: manager_actions table created' as status;
