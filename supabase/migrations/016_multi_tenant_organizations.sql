-- Multi-Tenant Organization Layer
-- Enables selling to multiple restaurant groups/customers

-- ============================================================================
-- ORGANIZATIONS (Top-level tenant)
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization details
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT,

  -- Subscription
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'professional', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'cancelled', 'trial')),
  trial_ends_at TIMESTAMPTZ,
  subscription_starts_at TIMESTAMPTZ,

  -- Billing
  billing_email TEXT,
  billing_address JSONB,
  stripe_customer_id TEXT,

  -- Limits (based on plan)
  max_venues INTEGER DEFAULT 1,
  max_employees INTEGER DEFAULT 50,
  max_storage_gb INTEGER DEFAULT 10,

  -- Features enabled
  features JSONB DEFAULT '[]', -- ['labor_os', 'inventory', 'recipes', etc]

  -- Contact
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  primary_contact_phone TEXT,

  -- Settings
  timezone TEXT DEFAULT 'America/New_York',
  currency TEXT DEFAULT 'USD',
  date_format TEXT DEFAULT 'MM/DD/YYYY',
  time_format TEXT DEFAULT '12h',

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  onboarding_completed BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_active ON organizations(is_active);
CREATE INDEX idx_organizations_stripe ON organizations(stripe_customer_id);

COMMENT ON TABLE organizations IS 'Top-level tenant - each restaurant group/customer';

-- ============================================================================
-- UPDATE VENUES TABLE
-- ============================================================================

-- Add organization_id to venues
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Make organization_id required for new venues (backfill existing to default org)
-- Create default organization for existing data
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  -- Create default organization if venues exist without org
  IF EXISTS (SELECT 1 FROM venues WHERE organization_id IS NULL) THEN
    INSERT INTO organizations (name, plan, subscription_status)
    VALUES ('Default Organization', 'enterprise', 'active')
    RETURNING id INTO default_org_id;

    -- Assign all existing venues to default org
    UPDATE venues SET organization_id = default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

-- Now make it required
ALTER TABLE venues ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX idx_venues_organization ON venues(organization_id, is_active);

-- ============================================================================
-- ORGANIZATION USERS & PERMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- References auth.users

  -- Role
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'viewer')),

  -- Venue access (if NULL, access to all venues in org)
  venue_ids UUID[] DEFAULT NULL,

  -- Invitation
  invited_by UUID,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_organization_user UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_users_user ON organization_users(user_id, is_active);
CREATE INDEX idx_org_users_org ON organization_users(organization_id, is_active);

COMMENT ON TABLE organization_users IS 'Maps users to organizations with roles';

-- ============================================================================
-- ORGANIZATION SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Time clock settings
  allow_mobile_clock_in BOOLEAN DEFAULT TRUE,
  require_photo_verification BOOLEAN DEFAULT TRUE,
  require_geofence BOOLEAN DEFAULT TRUE,
  geofence_radius_meters NUMERIC(8, 2) DEFAULT 100,

  -- Schedule settings
  allow_shift_swaps BOOLEAN DEFAULT TRUE,
  require_manager_approval_swaps BOOLEAN DEFAULT TRUE,
  allow_time_off_requests BOOLEAN DEFAULT TRUE,
  min_notice_hours_time_off INTEGER DEFAULT 24,

  -- Labor settings
  enable_auto_scheduling BOOLEAN DEFAULT TRUE,
  enable_labor_forecasting BOOLEAN DEFAULT TRUE,
  target_labor_percentage NUMERIC(5, 2) DEFAULT 27.5,

  -- Notification settings
  notify_slack BOOLEAN DEFAULT FALSE,
  slack_webhook_url TEXT,
  notify_email BOOLEAN DEFAULT TRUE,
  daily_briefing_enabled BOOLEAN DEFAULT TRUE,
  daily_briefing_time TIME DEFAULT '09:00:00',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_org_settings UNIQUE(organization_id)
);

COMMENT ON TABLE organization_settings IS 'Organization-wide feature settings';

-- ============================================================================
-- USAGE TRACKING (for billing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Usage metrics
  active_employees INTEGER DEFAULT 0,
  total_shifts INTEGER DEFAULT 0,
  total_clock_ins INTEGER DEFAULT 0,
  storage_used_gb NUMERIC(8, 2) DEFAULT 0,
  api_calls INTEGER DEFAULT 0,

  -- Computed costs (for invoicing)
  computed_cost NUMERIC(10, 2) DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_org_usage_period UNIQUE(organization_id, period_start)
);

CREATE INDEX idx_org_usage_period ON organization_usage(organization_id, period_start DESC);

COMMENT ON TABLE organization_usage IS 'Monthly usage tracking for billing';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;

-- Venues: Users can only see venues in their organization
CREATE POLICY venues_isolation ON venues
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Employees: Users can only see employees in their organization's venues
CREATE POLICY employees_isolation ON employees
  FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Time Punches: Only managers/admins can see punches for their organization's venues
CREATE POLICY time_punches_isolation ON time_punches
  FOR ALL
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.is_active = TRUE
    )
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get user's organization
CREATE OR REPLACE FUNCTION get_user_organization()
RETURNS UUID AS $$
  SELECT organization_id
  FROM organization_users
  WHERE user_id = auth.uid()
    AND is_active = TRUE
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
      AND is_active = TRUE
      AND (
        role = required_role
        OR (required_role = 'viewer' AND role IN ('owner', 'admin', 'manager', 'viewer'))
        OR (required_role = 'manager' AND role IN ('owner', 'admin', 'manager'))
        OR (required_role = 'admin' AND role IN ('owner', 'admin'))
      )
  );
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- SEED DEFAULT SETTINGS
-- ============================================================================

-- Create settings for existing organizations
INSERT INTO organization_settings (organization_id)
SELECT id FROM organizations
WHERE id NOT IN (SELECT organization_id FROM organization_settings)
ON CONFLICT (organization_id) DO NOTHING;
