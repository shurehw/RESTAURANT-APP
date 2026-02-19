-- Migration: Add comp/incident/coaching tags and notes to nightly_attestations
-- Mirrors the existing revenue_tags/revenue_notes and labor_tags/labor_notes pattern.

ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS comp_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS comp_notes TEXT,
  ADD COLUMN IF NOT EXISTS incident_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS incident_notes TEXT,
  ADD COLUMN IF NOT EXISTS coaching_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS coaching_notes TEXT;
