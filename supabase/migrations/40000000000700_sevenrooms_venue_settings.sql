-- ============================================================================
-- MIGRATION 1007: SevenRooms Venue Settings & Pacing Overrides
-- ============================================================================
-- Per-venue SR integration config and pacing overrides.
-- Stores OpSOS-authoritative settings alongside live SR data.
-- Pattern: 276_toast_venue_config.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS sevenrooms_venue_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Venue link (org_id denormalized for RLS)
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id              UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- SR linkage
  sr_venue_id           TEXT,

  -- Connection status
  is_connected          BOOLEAN NOT NULL DEFAULT false,
  last_sync_at          TIMESTAMPTZ,
  last_sync_status      TEXT CHECK (last_sync_status IN ('success', 'error', 'pending')),
  last_sync_error       TEXT,

  -- Pacing overrides (OpSOS-authoritative when set)
  covers_per_interval   INTEGER,
  custom_pacing         JSONB DEFAULT '{}',
  interval_minutes      INTEGER,

  -- Turn time overrides (party_size_key → minutes)
  turn_time_overrides   JSONB DEFAULT '{}',

  -- Write-back tracking
  last_push_at          TIMESTAMPTZ,
  last_push_status      TEXT CHECK (last_push_status IN ('success', 'error', 'unsupported')),
  last_push_error       TEXT,

  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID,

  -- Constraints
  CONSTRAINT uq_sr_settings_venue UNIQUE(venue_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sr_venue_settings_org
  ON sevenrooms_venue_settings(org_id);

-- RLS
ALTER TABLE sevenrooms_venue_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to sr_venue_settings"
  ON sevenrooms_venue_settings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view sr_venue_settings"
  ON sevenrooms_venue_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE v.id = sevenrooms_venue_settings.venue_id
        AND ou.user_id = auth.uid()
    )
  );

GRANT SELECT ON sevenrooms_venue_settings TO authenticated;
GRANT ALL ON sevenrooms_venue_settings TO service_role;

-- ── Seed rows for known venues with SR venue IDs ───────────────────────────

INSERT INTO sevenrooms_venue_settings (org_id, venue_id, sr_venue_id, is_connected)
SELECT v.organization_id, v.id,
  CASE v.id::text
    WHEN '79c33e6a-eb21-419f-9606-7494d1a9584c' THEN 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDl173FzggM'
    WHEN '11111111-1111-1111-1111-111111111111' THEN 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDQwPySzgkM'
    WHEN '288b7f22-ffdc-4701-a396-a6b415aff0f1' THEN 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDC-ILN_goM'
    WHEN '22222222-2222-2222-2222-222222222222' THEN 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDQkpbjtwoM'
    WHEN '98be7b04-918e-4e08-8d7a-fce8fe854d3c' THEN 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgICw_9Xx_wsM'
    WHEN 'a7da18a4-a70b-4492-abed-c9fed5851c9e' THEN 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDk8dXFiQgM'
    WHEN 'f9fb757b-e2dc-4c16-835d-9de80f983073' THEN 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDGrbuAtgoM'
    WHEN 'a2f9d28d-8dde-4b57-8013-2c94602fe078' THEN 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgICwjq347ggM'
    WHEN 'c6776476-44c5-454b-9765-29f3737e3776' THEN 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgICwmejqsgoM'
    ELSE NULL
  END,
  true
FROM venues v
WHERE v.id::text IN (
  '79c33e6a-eb21-419f-9606-7494d1a9584c',
  '11111111-1111-1111-1111-111111111111',
  '288b7f22-ffdc-4701-a396-a6b415aff0f1',
  '22222222-2222-2222-2222-222222222222',
  '98be7b04-918e-4e08-8d7a-fce8fe854d3c',
  'a7da18a4-a70b-4492-abed-c9fed5851c9e',
  'f9fb757b-e2dc-4c16-835d-9de80f983073',
  'a2f9d28d-8dde-4b57-8013-2c94602fe078',
  'c6776476-44c5-454b-9765-29f3737e3776'
)
ON CONFLICT ON CONSTRAINT uq_sr_settings_venue DO UPDATE SET
  sr_venue_id = EXCLUDED.sr_venue_id,
  is_connected = true,
  updated_at = now();

SELECT 'SevenRooms venue settings table created and seeded' AS status;
