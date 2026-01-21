-- Enable RLS on item_pack_configurations
ALTER TABLE item_pack_configurations ENABLE ROW LEVEL SECURITY;

-- Allow users to read pack configurations for items in their organization
CREATE POLICY "Users can view pack configs for their org items"
ON item_pack_configurations
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM items
    JOIN organization_users ON organization_users.organization_id = items.organization_id
    WHERE items.id = item_pack_configurations.item_id
      AND organization_users.user_id = auth.uid()
      AND organization_users.is_active = true
  )
);

-- Allow users to insert pack configurations for items in their organization
CREATE POLICY "Users can insert pack configs for their org items"
ON item_pack_configurations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM items
    JOIN organization_users ON organization_users.organization_id = items.organization_id
    WHERE items.id = item_pack_configurations.item_id
      AND organization_users.user_id = auth.uid()
      AND organization_users.is_active = true
  )
);

-- Allow users to update pack configurations for items in their organization
CREATE POLICY "Users can update pack configs for their org items"
ON item_pack_configurations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM items
    JOIN organization_users ON organization_users.organization_id = items.organization_id
    WHERE items.id = item_pack_configurations.item_id
      AND organization_users.user_id = auth.uid()
      AND organization_users.is_active = true
  )
);

-- Allow users to delete pack configurations for items in their organization
CREATE POLICY "Users can delete pack configs for their org items"
ON item_pack_configurations
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM items
    JOIN organization_users ON organization_users.organization_id = items.organization_id
    WHERE items.id = item_pack_configurations.item_id
      AND organization_users.user_id = auth.uid()
      AND organization_users.is_active = true
  )
);
