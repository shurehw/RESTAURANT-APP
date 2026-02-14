-- Verification Evaluator (P3 from feedback spine)
--
-- Closes the enforcement proof loop:
--   resolved feedback_objects with a verification_spec get evaluated
--   against actual data after the window elapses.
--
-- If behavior changed → verification_result = 'pass' (proof recorded)
-- If behavior persisted → verification_result = 'fail' (new escalated item created)

-- ============================================================
-- 1. Add verification result columns to feedback_objects
-- ============================================================
alter table feedback_objects
  add column if not exists verified_at timestamptz,
  add column if not exists verification_result text
    check (verification_result in ('pass', 'fail', 'insufficient_data')),
  add column if not exists verification_data jsonb;

-- Index for finding resolved items awaiting verification
create index if not exists idx_feedback_pending_verification
  on feedback_objects (resolved_at)
  where status = 'resolved'
    and verification_spec is not null
    and verified_at is null;


-- ============================================================
-- 2. feedback_outcomes: Audit trail of every evaluation
-- ============================================================
create table if not exists feedback_outcomes (
  id uuid primary key default gen_random_uuid(),
  feedback_object_id uuid not null references feedback_objects(id) on delete cascade,

  -- Evaluation result
  evaluated_at timestamptz not null default now(),
  result text not null check (result in ('pass', 'fail', 'insufficient_data')),

  -- Spec snapshot (immutable copy at evaluation time)
  verification_spec jsonb not null,

  -- Measured values
  measured_values jsonb not null default '{}',

  -- Window
  window_start date not null,
  window_end date not null,
  days_with_data integer not null default 0,

  -- If fail, the new escalated feedback object
  successor_id uuid references feedback_objects(id),

  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_feedback_outcomes_object
  on feedback_outcomes (feedback_object_id);

create index if not exists idx_feedback_outcomes_evaluated
  on feedback_outcomes (evaluated_at desc);

create index if not exists idx_feedback_outcomes_result
  on feedback_outcomes (result)
  where result = 'fail';


-- ============================================================
-- 3. RLS Policies
-- ============================================================
alter table feedback_outcomes enable row level security;

-- Users can view outcomes for feedback objects they can see
create policy "Users can view feedback outcomes for their venues"
  on feedback_outcomes for select
  using (
    feedback_object_id in (
      select fo.id from feedback_objects fo
      where fo.venue_id in (select venue_id from current_user_venue_ids)
    )
  );

-- Service role inserts (evaluator runs in cron context, bypasses RLS)


-- ============================================================
-- 4. Grants
-- ============================================================
grant select on feedback_outcomes to authenticated;
