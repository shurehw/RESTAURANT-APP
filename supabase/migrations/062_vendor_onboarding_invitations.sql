-- Vendor Onboarding Invitations
-- Generate shareable links for vendors to submit their profile

CREATE TABLE IF NOT EXISTS vendor_onboarding_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,

  -- Invitation details
  created_by UUID REFERENCES auth.users(id),
  email_sent_to TEXT,
  expires_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'expired')),
  submitted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vendor_onboarding_token ON vendor_onboarding_invitations(token);
CREATE INDEX idx_vendor_onboarding_vendor ON vendor_onboarding_invitations(vendor_id);
CREATE INDEX idx_vendor_onboarding_status ON vendor_onboarding_invitations(status);

COMMENT ON TABLE vendor_onboarding_invitations IS 'Shareable links for vendors to submit profile information';

-- Generate random token function
CREATE OR REPLACE FUNCTION generate_onboarding_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64url');
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE vendor_onboarding_invitations ENABLE ROW LEVEL SECURITY;

-- Public can read with valid token (no auth required)
CREATE POLICY "Public can read with token"
  ON vendor_onboarding_invitations FOR SELECT
  USING (true);

-- Super admins full access
CREATE POLICY "Super admins full access to vendor_onboarding_invitations"
  ON vendor_onboarding_invitations FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Organization users can create for their vendors
CREATE POLICY "Users create invitations for their vendors"
  ON vendor_onboarding_invitations FOR INSERT TO authenticated
  WITH CHECK (
    vendor_id IN (
      SELECT v.id FROM vendors v
      WHERE EXISTS (
        SELECT 1 FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  );
