ALTER TABLE attestation_signals
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_to_name TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_date DATE,
  ADD COLUMN IF NOT EXISTS follow_up_status TEXT,
  ADD COLUMN IF NOT EXISTS last_followed_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_follow_up_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attestation_signals_follow_up_status_check'
  ) THEN
    ALTER TABLE attestation_signals
      ADD CONSTRAINT attestation_signals_follow_up_status_check
      CHECK (
        follow_up_status IS NULL
        OR follow_up_status IN ('open', 'due', 'in_progress', 'resolved', 'escalated')
      );
  END IF;
END $$;

UPDATE attestation_signals
SET follow_up_status = CASE
  WHEN commitment_status = 'fulfilled' THEN 'resolved'
  WHEN commitment_status = 'unfulfilled' THEN 'escalated'
  ELSE commitment_status::text
END
WHERE signal_type = 'action_commitment'
  AND follow_up_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_signals_follow_up_status
  ON attestation_signals(venue_id, follow_up_status, follow_up_date)
  WHERE signal_type = 'action_commitment';

CREATE INDEX IF NOT EXISTS idx_signals_assigned_to
  ON attestation_signals(assigned_to_user_id, follow_up_status)
  WHERE signal_type = 'action_commitment' AND assigned_to_user_id IS NOT NULL;
