-- ============================================================================
-- 273: Weekly GM Notes
--
-- Structured context from the GM for each venue/week. Feeds into the
-- AI weekly narrative so Claude can weave in human context alongside data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_gm_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  week_start    date NOT NULL,

  -- Summary
  headline            text,           -- One-liner: "Slow Monday, strong weekend recovery"
  revenue_context     text,           -- Why specific days were up/down (events, weather, 86'd items)

  -- Guest Experience
  opentable_rating    numeric(2,1),   -- Current OT rating (e.g. 4.7)
  google_rating       numeric(2,1),   -- Current Google rating (e.g. 4.5)
  guest_compliments   text,           -- Top 3 compliments from the week
  guest_complaints    text,           -- Top 3 complaints from the week
  guest_action_items  text,           -- Action plan: items + owner

  -- Team & Staffing
  staffing_notes      text,           -- New hires, promotions, terminations
  team_shoutout       text,           -- Recognition: who stood out this week

  -- Enforcement
  comp_context        text,           -- Explain flagged comps/exceptions

  -- Operations
  operations_notes    text,           -- Venue needs, maintenance, rez flow, event setup

  -- Forward-Looking
  next_week_outlook   text,           -- Focus items for next week
  upcoming_events     text,           -- Events for the month / updates

  -- Meta
  submitted_by  uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE(venue_id, week_start)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_weekly_gm_notes_venue_week
  ON weekly_gm_notes(venue_id, week_start);

-- RLS
ALTER TABLE weekly_gm_notes ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "weekly_gm_notes_service" ON weekly_gm_notes
  FOR ALL USING (true) WITH CHECK (true);

-- Org-scoped read: users can see notes for venues in their org
CREATE POLICY "weekly_gm_notes_select" ON weekly_gm_notes
  FOR SELECT TO authenticated USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Org-scoped write: users can insert/update notes for venues in their org
CREATE POLICY "weekly_gm_notes_insert" ON weekly_gm_notes
  FOR INSERT TO authenticated WITH CHECK (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

CREATE POLICY "weekly_gm_notes_update" ON weekly_gm_notes
  FOR UPDATE TO authenticated USING (
    venue_id IN (
      SELECT v.id FROM venues v
      JOIN organization_users ou ON ou.organization_id = v.organization_id
      WHERE ou.user_id = auth.uid() AND ou.is_active = TRUE
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_weekly_gm_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_weekly_gm_notes_updated_at
  BEFORE UPDATE ON weekly_gm_notes
  FOR EACH ROW EXECUTE FUNCTION update_weekly_gm_notes_updated_at();
