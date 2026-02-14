/**
 * Migration 229: Enforcement Notifications
 *
 * Proactive notification system for the enforcement spine.
 * Creates in-app notification records and supports Slack webhook delivery.
 *
 * Notification types:
 *   - attestation_reminder: deadline approaching (1h before)
 *   - attestation_late: past deadline, not submitted
 *   - escalation: item escalated to your role
 *   - feedback_critical: new critical feedback object assigned to you
 *   - verification_failed: verification failed, recurring issue created
 */

-- ============================================================================
-- ENFORCEMENT NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS enforcement_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- auth.users recipient

  -- Classification
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'attestation_reminder',
    'attestation_late',
    'escalation',
    'feedback_critical',
    'verification_failed'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'slack', 'email')),

  -- Content
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT, -- relative URL to navigate to

  -- Source (polymorphic)
  source_table TEXT, -- feedback_object | manager_action | nightly_attestation
  source_id UUID,

  -- Delivery
  delivery_status TEXT NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'failed', 'pending')),
  error_message TEXT,

  -- Read state (for in_app)
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query: user's unread notifications, newest first
CREATE INDEX idx_enforcement_notifications_user_unread
  ON enforcement_notifications(user_id, is_read, created_at DESC);

-- Venue + type lookups (for dedup checks)
CREATE INDEX idx_enforcement_notifications_venue_type
  ON enforcement_notifications(venue_id, notification_type, created_at DESC);

-- Source lookups (find notifications for a specific entity)
CREATE INDEX idx_enforcement_notifications_source
  ON enforcement_notifications(source_table, source_id);

-- Org-level queries
CREATE INDEX idx_enforcement_notifications_org
  ON enforcement_notifications(org_id, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE enforcement_notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY enforcement_notifications_select ON enforcement_notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY enforcement_notifications_update ON enforcement_notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can insert (system-generated notifications)
CREATE POLICY enforcement_notifications_insert ON enforcement_notifications
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE enforcement_notifications IS 'Proactive enforcement notifications: in-app, Slack, email (future)';
COMMENT ON COLUMN enforcement_notifications.notification_type IS 'Type of enforcement event that triggered this notification';
COMMENT ON COLUMN enforcement_notifications.channel IS 'Delivery channel: in_app (stored + displayed), slack (webhook), email (future)';
COMMENT ON COLUMN enforcement_notifications.source_table IS 'Polymorphic link to source entity (feedback_object, manager_action, nightly_attestation)';
COMMENT ON COLUMN enforcement_notifications.action_url IS 'Relative URL the user should navigate to for this notification';
