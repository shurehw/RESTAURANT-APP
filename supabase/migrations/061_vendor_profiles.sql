-- Vendor Profiles and ACH Authorization Forms

-- Vendor profile extended information
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,

  -- Vendor/Payee Type
  entity_type TEXT CHECK (entity_type IN ('individual', 'company')),
  legal_name TEXT,
  company_name TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'US',

  -- Contact
  contact_person_first_name TEXT,
  contact_person_last_name TEXT,
  remittance_email TEXT,

  -- Banking Information
  bank_name TEXT,
  bank_address_line1 TEXT,
  bank_address_line2 TEXT,
  bank_city TEXT,
  bank_state TEXT,
  bank_zip_code TEXT,
  name_on_account TEXT,
  bank_routing_number TEXT,
  account_type TEXT CHECK (account_type IN ('checking', 'savings')),
  account_number_last4 TEXT, -- Only store last 4 digits for security

  -- Documents (store file paths)
  voided_check_url TEXT,
  w9_form_url TEXT,

  -- Status
  profile_complete BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(vendor_id)
);

CREATE INDEX idx_vendor_profiles_vendor ON vendor_profiles(vendor_id);

COMMENT ON TABLE vendor_profiles IS 'Extended vendor profile information including banking and documents';

-- ACH Authorization Forms
CREATE TABLE IF NOT EXISTS vendor_ach_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  vendor_profile_id UUID REFERENCES vendor_profiles(id),

  -- Form Type
  form_type TEXT NOT NULL CHECK (form_type IN ('new', 'change', 'cancel')),

  -- Authorization
  authorized_by TEXT,
  signature_data TEXT, -- Base64 signature or signature URL
  signature_date DATE,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ach_forms_vendor ON vendor_ach_forms(vendor_id);
CREATE INDEX idx_ach_forms_status ON vendor_ach_forms(status);

COMMENT ON TABLE vendor_ach_forms IS 'ACH authorization form submissions for vendor payments';

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_vendor_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vendor_profile_timestamp
  BEFORE UPDATE ON vendor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_profile_timestamp();

CREATE TRIGGER update_vendor_ach_form_timestamp
  BEFORE UPDATE ON vendor_ach_forms
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_profile_timestamp();

-- RLS Policies
ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_ach_forms ENABLE ROW LEVEL SECURITY;

-- Super admins full access
CREATE POLICY "Super admins full access to vendor_profiles"
  ON vendor_profiles FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins full access to vendor_ach_forms"
  ON vendor_ach_forms FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Organization users can view their vendors' profiles
CREATE POLICY "Users view their org vendor profiles"
  ON vendor_profiles FOR SELECT TO authenticated
  USING (
    vendor_id IN (
      SELECT v.id FROM vendors v
      WHERE EXISTS (
        SELECT 1 FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  );

CREATE POLICY "Users view their org vendor ACH forms"
  ON vendor_ach_forms FOR SELECT TO authenticated
  USING (
    vendor_id IN (
      SELECT v.id FROM vendors v
      WHERE EXISTS (
        SELECT 1 FROM organization_users ou
        WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
      )
    )
  );
