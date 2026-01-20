-- Add GL account mapping to items
-- This allows items to automatically code to GL accounts

-- 1. Add gl_account_id to items table
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS gl_account_id UUID REFERENCES gl_accounts(id);

CREATE INDEX IF NOT EXISTS idx_items_gl_account
  ON items(gl_account_id)
  WHERE gl_account_id IS NOT NULL;

COMMENT ON COLUMN items.gl_account_id IS 'Default GL account for this item - invoices inherit this mapping';

-- 2. Add organization_id to items for multi-tenant isolation
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_items_organization
  ON items(organization_id);

COMMENT ON COLUMN items.organization_id IS 'Multi-tenant: items belong to an organization';

-- 3. Update RLS policies for items to include organization scoping
DROP POLICY IF EXISTS "Super admins full access to items" ON items;
DROP POLICY IF EXISTS "Users access their org items" ON items;

CREATE POLICY "Super admins full access to items"
  ON items FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users access their org items"
  ON items FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- 4. Function to auto-populate invoice_lines.gl_code from item mapping
CREATE OR REPLACE FUNCTION set_invoice_line_gl_from_item()
RETURNS TRIGGER AS $$
DECLARE
  v_gl_account_code TEXT;
BEGIN
  -- If line has an item_id, get its GL account code
  IF NEW.item_id IS NOT NULL THEN
    SELECT ga.external_code INTO v_gl_account_code
    FROM items i
    JOIN gl_accounts ga ON ga.id = i.gl_account_id
    WHERE i.id = NEW.item_id;

    -- Set the GL code on the invoice line
    IF v_gl_account_code IS NOT NULL THEN
      NEW.gl_code := v_gl_account_code;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_invoice_line_gl_code ON invoice_lines;

CREATE TRIGGER set_invoice_line_gl_code
  BEFORE INSERT OR UPDATE ON invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_line_gl_from_item();

COMMENT ON FUNCTION set_invoice_line_gl_from_item IS 'Auto-populate invoice line GL code from item mapping';

-- 6. Function to suggest GL account based on item category and name
CREATE OR REPLACE FUNCTION suggest_gl_account_for_item(
  p_item_id UUID,
  p_organization_id UUID
) RETURNS TABLE (
  gl_account_id UUID,
  external_code TEXT,
  name TEXT,
  section TEXT,
  confidence TEXT
) AS $$
DECLARE
  v_item_category TEXT;
  v_item_name TEXT;
BEGIN
  -- Get item details
  SELECT category, name INTO v_item_category, v_item_name
  FROM items
  WHERE id = p_item_id;

  -- Return suggested GL accounts based on category and keyword matching
  RETURN QUERY
  SELECT
    ga.id,
    ga.external_code,
    ga.name,
    ga.section,
    CASE
      -- High confidence: exact keyword match in both item and GL account names
      WHEN ga.name ILIKE '%' || SPLIT_PART(v_item_name, ' ', 1) || '%' THEN 'high'
      -- Medium confidence: category-based suggestion
      WHEN v_item_category = 'food' AND ga.section = 'COGS' AND ga.name ILIKE '%food%' THEN 'medium'
      WHEN v_item_category = 'beverage' AND ga.section = 'COGS' AND ga.name ILIKE '%bev%' THEN 'medium'
      WHEN v_item_category = 'packaging' AND ga.section = 'Opex' AND ga.name ILIKE '%supplies%' THEN 'medium'
      WHEN v_item_category = 'supplies' AND ga.section = 'Opex' THEN 'medium'
      -- Low confidence: section-based only
      WHEN v_item_category IN ('food', 'beverage') AND ga.section = 'COGS' THEN 'low'
      WHEN v_item_category IN ('packaging', 'supplies') AND ga.section = 'Opex' THEN 'low'
      ELSE 'low'
    END as confidence
  FROM gl_accounts ga
  WHERE ga.org_id = p_organization_id
    AND ga.is_active = true
    AND ga.is_summary = false  -- Don't suggest summary accounts
    AND (
      -- Match by category
      (v_item_category = 'food' AND ga.section = 'COGS') OR
      (v_item_category = 'beverage' AND ga.section = 'COGS') OR
      (v_item_category IN ('packaging', 'supplies') AND ga.section = 'Opex') OR
      -- Match by keyword in name
      ga.name ILIKE '%' || SPLIT_PART(v_item_name, ' ', 1) || '%'
    )
  ORDER BY
    CASE confidence
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3
    END,
    ga.display_order
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION suggest_gl_account_for_item IS 'AI-like GL account suggestions based on item category and name matching';

-- 5. Backfill organization_id for existing items from venues
-- This assumes items are currently shared across the system, we'll assign them to orgs based on usage
DO $$
DECLARE
  v_default_org_id UUID;
BEGIN
  -- Get the first organization as default (or you can specify h.woods)
  SELECT id INTO v_default_org_id
  FROM organizations
  WHERE name = 'The h.wood Group'
  LIMIT 1;

  IF v_default_org_id IS NOT NULL THEN
    -- Assign all existing items to h.woods for now
    UPDATE items
    SET organization_id = v_default_org_id
    WHERE organization_id IS NULL;

    RAISE NOTICE 'Assigned % items to organization %',
      (SELECT COUNT(*) FROM items WHERE organization_id = v_default_org_id),
      v_default_org_id;
  END IF;
END $$;
