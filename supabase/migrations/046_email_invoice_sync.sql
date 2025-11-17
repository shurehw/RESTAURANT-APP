/**
 * Migration 046: Email Invoice Sync
 * Tracks emails synced from ap@hwoodgroup.com and other AP inboxes
 * Multi-tenant: scoped to organizations
 */

-- Email sync configuration per organization
CREATE TABLE IF NOT EXISTS email_sync_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Email account details
  email_address TEXT NOT NULL, -- e.g., ap@hwoodgroup.com
  email_type TEXT NOT NULL CHECK (email_type IN ('microsoft_graph', 'gmail', 'imap')),

  -- Sync settings
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_process_invoices BOOLEAN NOT NULL DEFAULT true,
  default_venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,

  -- Filters
  sender_whitelist TEXT[], -- Only process emails from these senders
  subject_keywords TEXT[] DEFAULT ARRAY['invoice', 'bill', 'statement'],

  -- Sync status
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  total_emails_synced INTEGER DEFAULT 0,
  total_invoices_created INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_email_sync_config UNIQUE(organization_id, email_address)
);

CREATE INDEX idx_email_sync_config_org ON email_sync_config(organization_id, enabled);
CREATE INDEX idx_email_sync_config_email ON email_sync_config(email_address);

COMMENT ON TABLE email_sync_config IS 'Email sync configuration per organization for AP invoice automation';

-- Synced emails tracking (prevent duplicates)
CREATE TABLE IF NOT EXISTS synced_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_sync_config_id UUID NOT NULL REFERENCES email_sync_config(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Email identifiers
  email_message_id TEXT NOT NULL, -- Microsoft Graph message ID or Gmail message ID
  email_subject TEXT,
  email_from TEXT,
  email_received_at TIMESTAMPTZ NOT NULL,

  -- Processing status
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  -- Error tracking
  processing_error TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_synced_email UNIQUE(email_sync_config_id, email_message_id)
);

CREATE INDEX idx_synced_emails_config ON synced_emails(email_sync_config_id, processed);
CREATE INDEX idx_synced_emails_org ON synced_emails(organization_id);
CREATE INDEX idx_synced_emails_invoice ON synced_emails(invoice_id);
CREATE INDEX idx_synced_emails_received ON synced_emails(email_received_at DESC);

COMMENT ON TABLE synced_emails IS 'Tracks emails synced from AP inboxes to prevent duplicate processing';

-- Email attachments (for audit trail)
CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  synced_email_id UUID NOT NULL REFERENCES synced_emails(id) ON DELETE CASCADE,

  -- Attachment details
  attachment_name TEXT NOT NULL,
  attachment_type TEXT, -- MIME type
  attachment_size_bytes INTEGER,

  -- Storage
  storage_path TEXT, -- Path in Supabase storage
  storage_url TEXT, -- Public URL if applicable

  -- Processing
  processed BOOLEAN NOT NULL DEFAULT false,
  ocr_confidence NUMERIC(3,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_attachments_email ON email_attachments(synced_email_id);

COMMENT ON TABLE email_attachments IS 'Tracks invoice attachments from synced emails';

-- RLS Policies
ALTER TABLE email_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

-- email_sync_config: Users can only see configs for their organization
CREATE POLICY email_sync_config_isolation ON email_sync_config
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- synced_emails: Users can only see emails for their organization
CREATE POLICY synced_emails_isolation ON synced_emails
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- email_attachments: Users can only see attachments from their org's emails
CREATE POLICY email_attachments_isolation ON email_attachments
  FOR ALL
  USING (
    synced_email_id IN (
      SELECT id FROM synced_emails
      WHERE organization_id IN (
        SELECT organization_id FROM organization_users
        WHERE user_id = auth.uid() AND is_active = TRUE
      )
    )
  );

-- Function: Mark email as processed
CREATE OR REPLACE FUNCTION mark_email_processed(
  p_synced_email_id UUID,
  p_invoice_id UUID DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE synced_emails
  SET
    processed = (p_error IS NULL),
    processed_at = NOW(),
    invoice_id = p_invoice_id,
    processing_error = p_error,
    retry_count = CASE WHEN p_error IS NOT NULL THEN retry_count + 1 ELSE retry_count END
  WHERE id = p_synced_email_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_email_processed IS 'Updates synced email processing status and links to created invoice';
