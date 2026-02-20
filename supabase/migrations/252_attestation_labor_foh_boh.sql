-- Migration: Add labor FOH/BOH narrative fields for guided prompt attestation
-- Part of the narrative-first refactor: managers write guided notes per module,
-- tags become AI-extracted metadata at submit time.

ALTER TABLE nightly_attestations
  ADD COLUMN IF NOT EXISTS labor_foh_notes TEXT,
  ADD COLUMN IF NOT EXISTS labor_boh_notes TEXT,
  ADD COLUMN IF NOT EXISTS labor_acknowledged BOOLEAN DEFAULT FALSE;
