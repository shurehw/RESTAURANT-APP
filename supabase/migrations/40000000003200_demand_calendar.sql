-- Demand Calendar — Pre-computed demand modifiers per venue/date
-- Enriched nightly by the compute-rez-metrics cron via:
--   1. US holiday detection (static)
--   2. Tripleseat private event data
--   3. Claude synthesis (ambient demand, local events, quiet periods)
--
-- Routes read from this table to populate ForecastContext.
-- 90-day rolling lookahead; dates without an entry fall back to defaults.

CREATE TABLE IF NOT EXISTS demand_calendar (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id                    UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  business_date               DATE NOT NULL,

  -- Holiday signals (static calendar)
  is_holiday                  BOOLEAN NOT NULL DEFAULT false,
  holiday_name                TEXT,                          -- "Thanksgiving", "Valentine's Day", etc.
  holiday_impact              TEXT CHECK (holiday_impact IN ('positive', 'negative', 'neutral')),

  -- Private event signals (from Tripleseat sync)
  has_private_event           BOOLEAN NOT NULL DEFAULT false,
  private_event_type          TEXT,                          -- 'buyout', 'semi_private', 'private_event'
  private_event_guest_count   INTEGER,
  private_event_revenue       NUMERIC(12,2),
  private_event_is_buyout     BOOLEAN DEFAULT false,

  -- Claude-synthesized demand modifier
  demand_multiplier           NUMERIC(5,3) NOT NULL DEFAULT 1.000,
  is_quiet_period             BOOLEAN NOT NULL DEFAULT false,   -- e.g. Coachella weekend (LA demand drops)
  narrative                   TEXT,                            -- host-facing explanation
  confidence                  TEXT NOT NULL DEFAULT 'medium'
                              CHECK (confidence IN ('high', 'medium', 'low')),
  raw_signals                 JSONB DEFAULT '{}',              -- full signal payload for debugging

  -- Pacing recommendations derived from this date's modifier
  open_pacing_recommended     BOOLEAN DEFAULT false,           -- suggest opening books wider/sooner
  lookahead_extension_days    INTEGER DEFAULT 0,               -- extra days to extend booking window

  -- Staleness tracking
  computed_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  tripleseat_synced_at        TIMESTAMPTZ,
  ai_enriched_at              TIMESTAMPTZ,

  CONSTRAINT uq_demand_calendar UNIQUE (venue_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_demand_calendar_venue_date
  ON demand_calendar(venue_id, business_date);
CREATE INDEX IF NOT EXISTS idx_demand_calendar_date
  ON demand_calendar(business_date);
CREATE INDEX IF NOT EXISTS idx_demand_calendar_quiet
  ON demand_calendar(venue_id, business_date) WHERE is_quiet_period = true;

ALTER TABLE demand_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY demand_calendar_org_isolation ON demand_calendar
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
