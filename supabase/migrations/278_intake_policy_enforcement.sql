/**
 * Migration 278: Intake Policy Enforcement
 *
 * Adds preferred vendor tracking, canonical item specifications,
 * and intake policy enforcement for invoice intake.
 *
 * Enforcement levels (tunable rails, not optional rules):
 *   - off:   detection disabled (not recommended)
 *   - warn:  flag violation, allow approval
 *   - block: flag violation, require override before approval
 */

-- ============================================================================
-- 1. EXTEND vendor_items: preferred vendor flag
-- ============================================================================

ALTER TABLE vendor_items
  ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_vi_preferred
  ON vendor_items(item_id, is_preferred)
  WHERE is_preferred = TRUE AND is_active = TRUE;

COMMENT ON COLUMN vendor_items.is_preferred IS
  'When TRUE, this vendor is the approved/preferred source for this item. '
  'Non-preferred vendor invoices trigger intake policy violations.';

-- ============================================================================
-- 2. EXTEND items: canonical specifications
-- ============================================================================

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS specifications JSONB;

CREATE INDEX IF NOT EXISTS idx_items_specifications
  ON items USING GIN (specifications)
  WHERE specifications IS NOT NULL;

COMMENT ON COLUMN items.specifications IS
  'Canonical item specifications for enforcement. Example: '
  '{"brand": "Swift", "grade": "USDA Choice", "trim": "PSMO", '
  '"pack_size": "4x28#", "unit_weight_lb": 7.0}';

-- ============================================================================
-- 3. EXTEND procurement_settings: intake policy columns
-- ============================================================================

ALTER TABLE procurement_settings
  ADD COLUMN IF NOT EXISTS intake_vendor_enforcement TEXT NOT NULL DEFAULT 'warn'
    CHECK (intake_vendor_enforcement IN ('off', 'warn', 'block')),
  ADD COLUMN IF NOT EXISTS intake_spec_enforcement TEXT NOT NULL DEFAULT 'warn'
    CHECK (intake_spec_enforcement IN ('off', 'warn', 'block')),
  ADD COLUMN IF NOT EXISTS intake_spec_fields TEXT[] NOT NULL DEFAULT
    ARRAY['brand', 'grade', 'trim', 'species', 'cut', 'pack_size'],
  ADD COLUMN IF NOT EXISTS intake_block_requires_override BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS intake_override_role TEXT NOT NULL DEFAULT 'admin';

COMMENT ON COLUMN procurement_settings.intake_vendor_enforcement IS
  'How to handle non-preferred vendor invoices: off/warn/block';
COMMENT ON COLUMN procurement_settings.intake_spec_enforcement IS
  'How to handle spec mismatches on invoice lines: off/warn/block';
COMMENT ON COLUMN procurement_settings.intake_spec_fields IS
  'Which specification fields to compare (e.g. brand, grade, trim)';
COMMENT ON COLUMN procurement_settings.intake_block_requires_override IS
  'When enforcement is block, whether a manager override can bypass';
COMMENT ON COLUMN procurement_settings.intake_override_role IS
  'Role required to override a block (admin or owner)';

-- ============================================================================
-- 4. CREATE intake_policy_violations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS intake_policy_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_line_id UUID REFERENCES invoice_lines(id) ON DELETE CASCADE,

  -- Classification
  violation_type TEXT NOT NULL CHECK (violation_type IN (
    'non_preferred_vendor', 'spec_mismatch', 'spec_missing'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  enforcement_action TEXT NOT NULL CHECK (enforcement_action IN ('warn', 'block')),

  -- Details
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  field_name TEXT,          -- e.g., 'brand', 'grade', 'trim' (for spec violations)
  expected_value TEXT,      -- canonical spec value
  actual_value TEXT,        -- OCR-parsed value from invoice
  message TEXT NOT NULL,    -- Human-readable description

  -- Resolution
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  override_reason TEXT,     -- Required when enforcement_action = 'block'

  -- Link to unified enforcement system
  control_plane_violation_id UUID,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ipv_invoice
  ON intake_policy_violations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ipv_invoice_line
  ON intake_policy_violations(invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_ipv_org_date
  ON intake_policy_violations(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ipv_unresolved
  ON intake_policy_violations(invoice_id)
  WHERE resolved = FALSE;

-- RLS
ALTER TABLE intake_policy_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ipv_select_org_users" ON intake_policy_violations
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "ipv_insert_service" ON intake_policy_violations
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "ipv_update_org_admins" ON intake_policy_violations
  FOR UPDATE USING (
    org_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
        AND role IN ('admin', 'owner')
    )
  );

-- ============================================================================
-- 5. SQL FUNCTION: check_intake_policy
-- ============================================================================

CREATE OR REPLACE FUNCTION check_intake_policy(
  p_invoice_id UUID,
  p_org_id UUID
)
RETURNS TABLE (
  invoice_line_id UUID,
  item_id UUID,
  vendor_id UUID,
  violation_type TEXT,
  severity TEXT,
  field_name TEXT,
  expected_value TEXT,
  actual_value TEXT,
  message TEXT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY

  -- 1. Non-preferred vendor violations
  --    Only fires when:
  --    a) The invoice line has a matched item_id
  --    b) A preferred vendor IS configured for that item
  --    c) The invoice vendor is NOT the preferred vendor
  SELECT
    il.id AS invoice_line_id,
    il.item_id,
    inv.vendor_id,
    'non_preferred_vendor'::TEXT AS violation_type,
    'warning'::TEXT AS severity,
    NULL::TEXT AS field_name,
    pv.preferred_vendor_name AS expected_value,
    v.name AS actual_value,
    format('Item "%s" received from non-preferred vendor "%s" (preferred: %s)',
      i.name, v.name, COALESCE(pv.preferred_vendor_name, 'none configured')
    ) AS message
  FROM invoice_lines il
  JOIN invoices inv ON inv.id = il.invoice_id
  JOIN items i ON i.id = il.item_id
  JOIN vendors v ON v.id = inv.vendor_id
  -- Find if a preferred vendor exists for this item
  LEFT JOIN LATERAL (
    SELECT v2.name AS preferred_vendor_name
    FROM vendor_items vi2
    JOIN vendors v2 ON v2.id = vi2.vendor_id
    WHERE vi2.item_id = il.item_id
      AND vi2.is_preferred = TRUE
      AND vi2.is_active = TRUE
    LIMIT 1
  ) pv ON TRUE
  WHERE il.invoice_id = p_invoice_id
    AND il.item_id IS NOT NULL
    -- Only flag if a preferred vendor IS configured
    AND pv.preferred_vendor_name IS NOT NULL
    -- And the invoice vendor is NOT a preferred vendor for this item
    AND NOT EXISTS (
      SELECT 1 FROM vendor_items vi3
      WHERE vi3.vendor_id = inv.vendor_id
        AND vi3.item_id = il.item_id
        AND vi3.is_preferred = TRUE
        AND vi3.is_active = TRUE
    )

  UNION ALL

  -- 2. Spec mismatch violations
  --    Compares items.specifications against invoice_lines.product_specs
  --    Only checks fields present in both JSON objects
  SELECT
    il.id AS invoice_line_id,
    il.item_id,
    inv.vendor_id,
    'spec_mismatch'::TEXT AS violation_type,
    'critical'::TEXT AS severity,
    spec.spec_key::TEXT AS field_name,
    (i.specifications->>spec.spec_key)::TEXT AS expected_value,
    (il.product_specs->>spec.spec_key)::TEXT AS actual_value,
    format('Spec mismatch on "%s" for item "%s": expected "%s", got "%s"',
      spec.spec_key, i.name,
      i.specifications->>spec.spec_key,
      il.product_specs->>spec.spec_key
    ) AS message
  FROM invoice_lines il
  JOIN invoices inv ON inv.id = il.invoice_id
  JOIN items i ON i.id = il.item_id
  CROSS JOIN jsonb_each_text(i.specifications) AS spec(spec_key, spec_val)
  WHERE il.invoice_id = p_invoice_id
    AND il.item_id IS NOT NULL
    AND i.specifications IS NOT NULL
    AND il.product_specs IS NOT NULL
    -- Field exists in both
    AND i.specifications ? spec.spec_key
    AND il.product_specs ? spec.spec_key
    -- Values differ (case-insensitive)
    AND LOWER(i.specifications->>spec.spec_key) != LOWER(il.product_specs->>spec.spec_key);
END;
$$;

COMMENT ON FUNCTION check_intake_policy IS
  'Checks an invoice against intake policy rules: '
  'preferred vendor enforcement and item specification compliance. '
  'Returns one row per violation found.';
