-- Enable RLS on messaging tables (BUG-008)

ALTER TABLE message_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

-- message_channels policies
CREATE POLICY "Users can view channels in their organization"
  ON message_channels FOR SELECT
  USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can create channels"
  ON message_channels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
        AND v.id = venue_id
    )
  );

CREATE POLICY "Managers can update channels"
  ON message_channels FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      JOIN venues v ON v.organization_id = ou.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
        AND v.id = venue_id
    )
  );

-- channel_members policies
CREATE POLICY "Users can view channel members in their org"
  ON channel_members FOR SELECT
  USING (
    channel_id IN (
      SELECT mc.id FROM message_channels mc
      JOIN venues v ON v.id = mc.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can add channel members"
  ON channel_members FOR INSERT
  WITH CHECK (
    channel_id IN (
      SELECT mc.id FROM message_channels mc
      JOIN venues v ON v.id = mc.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Managers can remove channel members"
  ON channel_members FOR DELETE
  USING (
    channel_id IN (
      SELECT mc.id FROM message_channels mc
      JOIN venues v ON v.id = mc.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

-- messages policies
-- Since employees don't have user_id, we check venue organization membership
CREATE POLICY "Users can view messages in their organization channels"
  ON messages FOR SELECT
  USING (
    channel_id IN (
      SELECT mc.id FROM message_channels mc
      JOIN venues v ON v.id = mc.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages to organization channels"
  ON messages FOR INSERT
  WITH CHECK (
    channel_id IN (
      SELECT mc.id FROM message_channels mc
      JOIN venues v ON v.id = mc.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can update messages in their organization"
  ON messages FOR UPDATE
  USING (
    channel_id IN (
      SELECT mc.id FROM message_channels mc
      JOIN venues v ON v.id = mc.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Managers can delete messages in their organization"
  ON messages FOR DELETE
  USING (
    channel_id IN (
      SELECT mc.id FROM message_channels mc
      JOIN venues v ON v.id = mc.venue_id
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid()
        AND ou.role IN ('owner', 'admin', 'manager')
    )
  );
