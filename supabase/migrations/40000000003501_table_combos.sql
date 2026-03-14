-- ── Table Combos ─────────────────────────────────────────────────
-- Allows the host to link 2+ tables together for a large party.
-- Seating, force-complete, and clear actions on the primary table
-- automatically propagate to all secondary tables in the combo.

CREATE TABLE IF NOT EXISTS table_combos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL,
  venue_id         uuid        NOT NULL,
  business_date    date        NOT NULL,
  primary_table_id uuid        NOT NULL,
  -- All table IDs in this combo (includes primary_table_id)
  combined_table_ids uuid[]    NOT NULL DEFAULT '{}',
  party_size       int,
  reservation_id   uuid,
  status           text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'released')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  released_at      timestamptz,

  -- Only one active combo per primary table per date
  UNIQUE (venue_id, business_date, primary_table_id)
);

-- Index for fast lookups
CREATE INDEX idx_table_combos_venue_date
  ON table_combos (venue_id, business_date)
  WHERE status = 'active';

-- RLS
ALTER TABLE table_combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on table_combos"
  ON table_combos FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Auth users can view table_combos"
  ON table_combos FOR SELECT
  TO authenticated USING (true);
