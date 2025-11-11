-- Team Messaging & Communication
-- Direct messages, group channels, announcements, @mentions

-- ============================================================================
-- CHANNELS (Group chats, DMs, Announcements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Channel info
  name TEXT,
  description TEXT,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('direct', 'group', 'announcement', 'shift', 'department')),

  -- For direct messages (2 participants)
  participant_ids UUID[] DEFAULT '{}',

  -- For group channels
  created_by UUID REFERENCES employees(id),
  is_private BOOLEAN DEFAULT FALSE,

  -- Department/shift filters
  department TEXT, -- 'front_of_house', 'back_of_house', etc.
  shift_type TEXT, -- 'breakfast', 'lunch', 'dinner'

  -- Settings
  is_archived BOOLEAN DEFAULT FALSE,
  is_muted BOOLEAN DEFAULT FALSE,

  -- Metadata
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_venue ON message_channels(venue_id, is_archived);
CREATE INDEX idx_channels_type ON message_channels(channel_type);
CREATE INDEX idx_channels_participants ON message_channels USING GIN(participant_ids);

COMMENT ON TABLE message_channels IS 'Chat channels - DMs, groups, announcements';

-- ============================================================================
-- CHANNEL MEMBERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES message_channels(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Member role
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),

  -- Notification settings
  is_muted BOOLEAN DEFAULT FALSE,
  notification_preference TEXT DEFAULT 'all' CHECK (notification_preference IN ('all', 'mentions', 'none')),

  -- Read status
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INTEGER DEFAULT 0,

  -- Membership
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,

  CONSTRAINT uq_channel_member UNIQUE(channel_id, employee_id)
);

CREATE INDEX idx_channel_members_channel ON channel_members(channel_id, is_active);
CREATE INDEX idx_channel_members_employee ON channel_members(employee_id, is_active);
CREATE INDEX idx_channel_members_unread ON channel_members(employee_id, unread_count) WHERE unread_count > 0;

COMMENT ON TABLE channel_members IS 'Channel membership and read status';

-- ============================================================================
-- MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES message_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Message content
  message_text TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system', 'announcement')),

  -- Attachments
  attachment_url TEXT,
  attachment_type TEXT, -- 'image', 'pdf', 'video'
  attachment_name TEXT,

  -- Mentions
  mentioned_employee_ids UUID[] DEFAULT '{}',
  mentioned_roles TEXT[] DEFAULT '{}', -- ['@managers', '@everyone', '@servers']

  -- Reply/thread
  reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  thread_count INTEGER DEFAULT 0,

  -- Reactions
  reactions JSONB DEFAULT '{}', -- {"👍": ["emp_id_1", "emp_id_2"], "❤️": ["emp_id_3"]}

  -- Status
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,

  -- Pinned
  is_pinned BOOLEAN DEFAULT FALSE,
  pinned_by UUID REFERENCES employees(id),
  pinned_at TIMESTAMPTZ,

  -- Announcement specific
  is_announcement BOOLEAN DEFAULT FALSE,
  announcement_priority TEXT CHECK (announcement_priority IN ('low', 'medium', 'high', 'urgent')),
  announcement_read_by UUID[] DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_mentions ON messages USING GIN(mentioned_employee_ids);
CREATE INDEX idx_messages_pinned ON messages(channel_id, is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX idx_messages_thread ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;

COMMENT ON TABLE messages IS 'Chat messages with mentions, replies, reactions';

-- ============================================================================
-- MESSAGE READ RECEIPTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_read_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_message_read UNIQUE(message_id, employee_id)
);

CREATE INDEX idx_read_receipts_message ON message_read_receipts(message_id);
CREATE INDEX idx_read_receipts_employee ON message_read_receipts(employee_id);

COMMENT ON TABLE message_read_receipts IS 'Track who read which messages';

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Notification type
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'message', 'mention', 'announcement', 'shift_swap', 'time_off', 'schedule_change', 'task_assigned'
  )),

  -- Content
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,

  -- Related entities
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES message_channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES employees(id),

  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  is_dismissed BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_employee ON notifications(employee_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_type ON notifications(notification_type);

COMMENT ON TABLE notifications IS 'Employee notifications for all system events';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update channel last_message_at and message_count when new message
CREATE OR REPLACE FUNCTION update_channel_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE message_channels
  SET
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    updated_at = NEW.created_at
  WHERE id = NEW.channel_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_channel_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_channel_on_message();

-- Increment unread count for channel members (except sender)
CREATE OR REPLACE FUNCTION increment_unread_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE channel_members
  SET unread_count = unread_count + 1
  WHERE channel_id = NEW.channel_id
    AND employee_id != NEW.sender_id
    AND is_active = TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_unread_count
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION increment_unread_count();

-- Create notifications for mentions
CREATE OR REPLACE FUNCTION create_mention_notifications()
RETURNS TRIGGER AS $$
DECLARE
  mentioned_emp_id UUID;
  sender_name TEXT;
BEGIN
  -- Get sender name
  SELECT first_name || ' ' || last_name INTO sender_name
  FROM employees WHERE id = NEW.sender_id;

  -- Create notification for each mentioned employee
  FOREACH mentioned_emp_id IN ARRAY NEW.mentioned_employee_ids
  LOOP
    INSERT INTO notifications (
      employee_id,
      notification_type,
      title,
      body,
      action_url,
      message_id,
      channel_id,
      sender_id
    ) VALUES (
      mentioned_emp_id,
      'mention',
      sender_name || ' mentioned you',
      LEFT(NEW.message_text, 100),
      '/messages/' || NEW.channel_id,
      NEW.id,
      NEW.channel_id,
      NEW.sender_id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_mention_notifications
  AFTER INSERT ON messages
  FOR EACH ROW
  WHEN (array_length(NEW.mentioned_employee_ids, 1) > 0)
  EXECUTE FUNCTION create_mention_notifications();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get or create direct message channel between two employees
CREATE OR REPLACE FUNCTION get_or_create_dm_channel(emp1_id UUID, emp2_id UUID, v_id UUID)
RETURNS UUID AS $$
DECLARE
  channel_id UUID;
  participants UUID[];
BEGIN
  -- Sort employee IDs to ensure consistent ordering
  IF emp1_id < emp2_id THEN
    participants := ARRAY[emp1_id, emp2_id];
  ELSE
    participants := ARRAY[emp2_id, emp1_id];
  END IF;

  -- Try to find existing DM channel
  SELECT id INTO channel_id
  FROM message_channels
  WHERE channel_type = 'direct'
    AND venue_id = v_id
    AND participant_ids = participants
  LIMIT 1;

  -- If not found, create new DM channel
  IF channel_id IS NULL THEN
    INSERT INTO message_channels (venue_id, channel_type, participant_ids)
    VALUES (v_id, 'direct', participants)
    RETURNING id INTO channel_id;

    -- Add both participants as members
    INSERT INTO channel_members (channel_id, employee_id, role)
    VALUES
      (channel_id, emp1_id, 'member'),
      (channel_id, emp2_id, 'member');
  END IF;

  RETURN channel_id;
END;
$$ LANGUAGE plpgsql;

-- Mark messages as read
CREATE OR REPLACE FUNCTION mark_messages_read(p_channel_id UUID, p_employee_id UUID, p_until_message_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Insert read receipts for unread messages
  INSERT INTO message_read_receipts (message_id, employee_id)
  SELECT m.id, p_employee_id
  FROM messages m
  WHERE m.channel_id = p_channel_id
    AND m.sender_id != p_employee_id
    AND m.id <= p_until_message_id
    AND NOT EXISTS (
      SELECT 1 FROM message_read_receipts
      WHERE message_id = m.id AND employee_id = p_employee_id
    )
  ON CONFLICT (message_id, employee_id) DO NOTHING;

  -- Reset unread count
  UPDATE channel_members
  SET
    unread_count = 0,
    last_read_at = NOW()
  WHERE channel_id = p_channel_id
    AND employee_id = p_employee_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DEFAULT CHANNELS
-- ============================================================================

-- Create default announcement channel for each venue
INSERT INTO message_channels (venue_id, name, description, channel_type, is_private)
SELECT
  id,
  'Announcements',
  'Company-wide announcements and updates',
  'announcement',
  FALSE
FROM venues
WHERE NOT EXISTS (
  SELECT 1 FROM message_channels
  WHERE message_channels.venue_id = venues.id
    AND channel_type = 'announcement'
);

-- Add all employees to announcement channels
INSERT INTO channel_members (channel_id, employee_id, role)
SELECT mc.id, e.id, 'member'
FROM message_channels mc
CROSS JOIN employees e
WHERE mc.channel_type = 'announcement'
  AND mc.venue_id = e.venue_id
  AND NOT EXISTS (
    SELECT 1 FROM channel_members cm
    WHERE cm.channel_id = mc.id AND cm.employee_id = e.id
  );
