-- ============================================================================
-- 256: Attestation Signals — AI-extracted structured entities from manager text
--
-- Turns 24 free-text attestation fields into structured, queryable signals.
-- Extracted post-submit by AI, then linked to outcomes over time.
--
-- Signal types:
--   employee_mention  — staff named in any field (with context: standout/development/issue)
--   action_commitment — "will do X", "plan to Y", "next shift Z"
--   menu_item         — specific items mentioned (86'd, specials, popular, problematic)
--   operational_issue — equipment, systems, process breakdowns
--   guest_insight     — VIP mentions, regulars, notable interactions
--   staffing_signal   — call-outs, coverage gaps, scheduling problems
-- ============================================================================

-- Signal type enum
DO $$ BEGIN
  CREATE TYPE signal_type AS ENUM (
    'employee_mention',
    'action_commitment',
    'menu_item',
    'operational_issue',
    'guest_insight',
    'staffing_signal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Employee mention sentiment
DO $$ BEGIN
  CREATE TYPE mention_sentiment AS ENUM (
    'positive',    -- standout, recognition, exceeded expectations
    'negative',    -- development need, issue, underperformance
    'neutral',     -- informational mention (scheduled, present, involved)
    'actionable'   -- requires follow-up or coaching
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Commitment status tracking
DO $$ BEGIN
  CREATE TYPE commitment_status AS ENUM (
    'open',        -- just extracted, not yet due
    'due',         -- follow-up window reached
    'fulfilled',   -- outcome data confirms action was taken
    'unfulfilled', -- follow-up window passed, no evidence of action
    'superseded'   -- replaced by a newer commitment
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Main signals table
-- ============================================================================

CREATE TABLE IF NOT EXISTS attestation_signals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id UUID NOT NULL REFERENCES nightly_attestations(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES venues(id),
  business_date DATE NOT NULL,
  submitted_by  UUID REFERENCES auth.users(id), -- which manager submitted the attestation

  -- What was extracted
  signal_type   signal_type NOT NULL,
  extracted_text TEXT NOT NULL,           -- the actual phrase/sentence AI pulled out
  source_field  TEXT NOT NULL,            -- which attestation field it came from (e.g. 'coaching_foh_standout')
  confidence    REAL NOT NULL DEFAULT 0.8, -- AI confidence 0-1

  -- Entity normalization
  entity_name   TEXT,                     -- normalized name (employee name, menu item, etc.)
  entity_type   TEXT,                     -- sub-classification ('server', 'bartender', 'line_cook', etc.)

  -- Employee mention specifics
  mention_sentiment mention_sentiment,    -- positive/negative/neutral/actionable
  mention_context   TEXT,                 -- why they were mentioned (1-2 sentence summary)

  -- Action commitment specifics
  commitment_text   TEXT,                 -- the specific commitment ("will add a server on Friday")
  commitment_target_date DATE,            -- when it should be done (AI-inferred or explicit)
  commitment_status commitment_status DEFAULT 'open',
  commitment_checked_at TIMESTAMPTZ,      -- last time we checked for fulfillment

  -- Outcome linking
  outcome_attestation_id UUID REFERENCES nightly_attestations(id), -- which future attestation resolved this
  outcome_notes TEXT,                     -- how the outcome was linked
  outcome_linked_at TIMESTAMPTZ,

  -- Metadata
  extraction_model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
  extracted_at    TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_signals_venue_date ON attestation_signals(venue_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_signals_attestation ON attestation_signals(attestation_id);
CREATE INDEX IF NOT EXISTS idx_signals_type ON attestation_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_entity ON attestation_signals(entity_name) WHERE entity_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_commitment_open ON attestation_signals(venue_id, commitment_status)
  WHERE signal_type = 'action_commitment' AND commitment_status IN ('open', 'due');
CREATE INDEX IF NOT EXISTS idx_signals_employee_mentions ON attestation_signals(venue_id, entity_name, business_date DESC)
  WHERE signal_type = 'employee_mention';
CREATE INDEX IF NOT EXISTS idx_signals_by_manager ON attestation_signals(submitted_by, business_date DESC)
  WHERE submitted_by IS NOT NULL;

-- RLS
ALTER TABLE attestation_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signals_read_own_org" ON attestation_signals
  FOR SELECT USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN user_venues uv ON uv.venue_id = v.id
      WHERE uv.user_id = auth.uid()
    )
  );

-- Service role can do everything (extraction runs server-side)
CREATE POLICY "signals_service_all" ON attestation_signals
  FOR ALL USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE attestation_signals IS 'AI-extracted structured signals from manager attestation free-text fields';
COMMENT ON COLUMN attestation_signals.source_field IS 'The attestation column this signal was extracted from (e.g. coaching_foh_standout, revenue_driver)';
COMMENT ON COLUMN attestation_signals.entity_name IS 'Normalized entity: employee name, menu item name, equipment name, etc.';
COMMENT ON COLUMN attestation_signals.submitted_by IS 'The auth.users ID of the manager who submitted the attestation';
COMMENT ON COLUMN attestation_signals.commitment_status IS 'Lifecycle for action_commitment signals: open → due → fulfilled/unfulfilled';
