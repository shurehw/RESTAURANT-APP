-- Carry Forward + Preshift Briefing System
--
-- Closes the enforcement loop: unresolved items carry forward automatically,
-- auto-escalate based on age/priority, and surface in a preshift briefing
-- that managers must review before service.
--
-- Works with BOTH enforcement pipelines:
--   Pipeline A: manager_actions (from attestation + AI review)
--   Pipeline B: feedback_objects (from feedback spine signals)

-- ============================================================
-- 1. preshift_briefings: Tracks briefing review per venue/day
-- ============================================================
create table if not exists preshift_briefings (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  business_date date not null,

  -- Review tracking
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,

  -- Snapshot counts at time of review (audit, not for display)
  manager_action_count integer not null default 0,
  feedback_object_count integer not null default 0,
  critical_count integer not null default 0,
  escalated_count integer not null default 0,

  -- Notes
  review_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_preshift_venue_date unique (venue_id, business_date)
);

-- Indexes
create index if not exists idx_preshift_briefings_venue_date
  on preshift_briefings (venue_id, business_date desc);

create index if not exists idx_preshift_briefings_unreviewed
  on preshift_briefings (venue_id)
  where reviewed_at is null;

-- Updated_at trigger
create trigger trigger_preshift_briefings_updated_at
  before update on preshift_briefings
  for each row execute function update_updated_at_column();


-- ============================================================
-- 2. escalation_log: Audit trail for auto-escalations
-- ============================================================
create table if not exists escalation_log (
  id uuid primary key default gen_random_uuid(),

  -- Polymorphic source
  source_table text not null check (source_table in ('manager_actions', 'feedback_objects')),
  source_id uuid not null,

  -- Escalation details
  from_role text,
  to_role text not null,
  reason text not null,

  -- Context
  venue_id uuid not null references venues(id) on delete cascade,
  business_date date,

  escalated_at timestamptz not null default now(),
  escalated_by text not null default 'system'
);

-- Indexes
create index if not exists idx_escalation_log_source
  on escalation_log (source_table, source_id);

create index if not exists idx_escalation_log_venue_date
  on escalation_log (venue_id, business_date);

create index if not exists idx_escalation_log_at
  on escalation_log (escalated_at desc);


-- ============================================================
-- 3. unified_enforcement_items: Combined view of both pipelines
-- ============================================================
create or replace view unified_enforcement_items as

-- Pipeline A: manager_actions (pending/in_progress/escalated, not expired)
select
  'manager_action'::text as source_table,
  ma.id as source_id,
  ma.venue_id,
  ma.business_date,
  ma.title,
  ma.description,
  ma.action as action_required,
  case ma.priority
    when 'urgent' then 1
    when 'high' then 2
    when 'medium' then 3
    when 'low' then 4
  end as priority_rank,
  ma.priority as priority_label,
  case ma.priority
    when 'urgent' then 'critical'
    when 'high' then 'warning'
    else 'info'
  end as severity,
  ma.category,
  ma.status,
  ma.assigned_to,
  ma.assigned_role,
  coalesce(ma.escalated_to, ma.assigned_role) as current_owner,
  ma.source_type,
  ma.created_at,
  ma.updated_at,
  ma.expires_at,
  ma.escalated_at,
  ma.escalated_to,
  ma.escalation_reason,
  extract(epoch from (now() - ma.created_at)) / 3600.0 as age_hours,
  ma.metadata
from manager_actions ma
where ma.status in ('pending', 'in_progress', 'escalated')
  and (ma.expires_at is null or ma.expires_at > now())

union all

-- Pipeline B: feedback_objects (open/acknowledged/in_progress/escalated)
select
  'feedback_object'::text as source_table,
  fo.id as source_id,
  fo.venue_id,
  fo.business_date,
  fo.title,
  fo.message as description,
  fo.required_action::text as action_required,
  case fo.severity
    when 'critical' then 1
    when 'warning' then 2
    when 'info' then 3
  end as priority_rank,
  fo.severity::text as priority_label,
  fo.severity::text as severity,
  fo.domain::text as category,
  fo.status::text as status,
  fo.assigned_to::text as assigned_to,
  fo.owner_role::text as assigned_role,
  coalesce(fo.escalated_to_role::text, fo.owner_role::text) as current_owner,
  'feedback_spine'::text as source_type,
  fo.created_at,
  fo.updated_at,
  fo.due_at as expires_at,
  fo.escalated_at,
  fo.escalated_to_role::text as escalated_to,
  fo.escalated_reason as escalation_reason,
  extract(epoch from (now() - fo.created_at)) / 3600.0 as age_hours,
  null::jsonb as metadata
from feedback_objects fo
where fo.status in ('open', 'acknowledged', 'in_progress', 'escalated');


-- ============================================================
-- 4. RLS Policies
-- ============================================================
alter table preshift_briefings enable row level security;

create policy "Users can view preshift briefings for their venues"
  on preshift_briefings for select
  using (venue_id in (select venue_id from current_user_venue_ids));

create policy "Managers can insert preshift briefings"
  on preshift_briefings for insert
  with check (
    venue_id in (
      select v.id from venues v
      join organization_users ou on v.organization_id = ou.organization_id
      where ou.user_id = auth.uid()
        and ou.role in ('owner', 'admin', 'manager')
        and ou.is_active = true
    )
  );

create policy "Managers can update preshift briefings for their venues"
  on preshift_briefings for update
  using (
    venue_id in (
      select v.id from venues v
      join organization_users ou on v.organization_id = ou.organization_id
      where ou.user_id = auth.uid()
        and ou.role in ('owner', 'admin', 'manager')
        and ou.is_active = true
    )
  );

alter table escalation_log enable row level security;

create policy "Users can view escalation logs for their venues"
  on escalation_log for select
  using (venue_id in (select venue_id from current_user_venue_ids));

-- Service role inserts (cron context bypasses RLS)


-- ============================================================
-- 5. Grants
-- ============================================================
grant select, insert, update on preshift_briefings to authenticated;
grant select on escalation_log to authenticated;
grant select on unified_enforcement_items to authenticated;
