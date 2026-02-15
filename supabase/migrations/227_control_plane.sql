-- OpSOS Action Center: Unified Enforcement Delivery System
-- Ingests violations from any source (comps, sales, greetings, staffing)
-- Routes to appropriate actions (alert, block, override, escalate)
-- Tracks enforcement state and provides unified operator feed

-- ============================================================================
-- 1. Violations (Source of Truth)
-- ============================================================================

create table if not exists control_plane_violations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  venue_id uuid references general_locations(uuid),

  -- Classification
  violation_type text not null, -- 'comp_exception', 'sales_pace', 'greeting_delay', 'staffing_gap'
  severity text not null check (severity in ('info', 'warning', 'critical')),

  -- Details
  title text not null,
  description text,
  metadata jsonb default '{}'::jsonb,

  -- Source tracing
  source_table text, -- 'comp_exceptions', 'sales_snapshots', 'greeting_metrics', etc.
  source_id text, -- Link back to original record

  -- Lifecycle
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users,
  resolution_note text,

  -- Business context
  business_date date not null,
  shift_period text, -- 'lunch', 'dinner', 'week_of_2024_02_10', etc.

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_violations_org_date on control_plane_violations(org_id, business_date);
create index idx_violations_venue_date on control_plane_violations(venue_id, business_date);
create index idx_violations_active on control_plane_violations(org_id, resolved_at)
  where resolved_at is null;
create index idx_violations_type_severity on control_plane_violations(violation_type, severity);

-- RLS
alter table control_plane_violations enable row level security;

create policy "Users can view violations for their org"
  on control_plane_violations for select
  using (
    org_id in (
      select org_id from user_profiles
      where user_id = auth.uid()
    )
  );

create policy "System can insert violations"
  on control_plane_violations for insert
  with check (true); -- Will be called by service role

create policy "Users can resolve violations"
  on control_plane_violations for update
  using (
    org_id in (
      select org_id from user_profiles
      where user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. Actions (What to Do About Violations)
-- ============================================================================

create table if not exists control_plane_actions (
  id uuid primary key default gen_random_uuid(),
  violation_id uuid references control_plane_violations on delete cascade not null,

  -- Action classification
  action_type text not null check (action_type in ('alert', 'block', 'require_override', 'escalate')),
  action_target text not null, -- email, user_id, slack_channel, system_name

  -- Action details
  message text not null,
  action_data jsonb default '{}'::jsonb, -- Type-specific payload

  -- Execution
  scheduled_for timestamptz not null default now(),
  executed_at timestamptz,
  execution_status text default 'pending' check (execution_status in ('pending', 'delivered', 'failed', 'dismissed')),
  execution_result jsonb,

  -- Dismissal (for non-critical alerts)
  dismissed_by uuid references auth.users,
  dismissed_at timestamptz,
  dismiss_reason text,

  created_at timestamptz default now()
);

-- Indexes
create index idx_actions_violation on control_plane_actions(violation_id);
create index idx_actions_pending on control_plane_actions(scheduled_for, execution_status)
  where executed_at is null and dismissed_at is null;
create index idx_actions_type on control_plane_actions(action_type, execution_status);

-- RLS
alter table control_plane_actions enable row level security;

create policy "Users can view actions for their org violations"
  on control_plane_actions for select
  using (
    violation_id in (
      select id from control_plane_violations
      where org_id in (
        select org_id from user_profiles
        where user_id = auth.uid()
      )
    )
  );

create policy "System can insert actions"
  on control_plane_actions for insert
  with check (true);

create policy "Users can dismiss actions"
  on control_plane_actions for update
  using (
    violation_id in (
      select id from control_plane_violations
      where org_id in (
        select org_id from user_profiles
        where user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 3. Action Templates (Org Configuration)
-- ============================================================================

create table if not exists control_plane_action_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,

  -- Trigger conditions
  violation_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),

  -- Action specification
  action_type text not null check (action_type in ('alert', 'block', 'require_override', 'escalate')),
  action_target text not null, -- Can include variables: {{gm_email}}, {{venue_slack_channel}}
  message_template text not null, -- "{{venue_name}} is {{gap}} FTE below minimum"

  -- Additional conditions
  enabled boolean default true,
  conditions jsonb default '{}'::jsonb, -- {"only_during_service": true, "min_threshold": 0.5}

  -- Metadata
  created_at timestamptz default now(),
  created_by uuid references auth.users,
  updated_at timestamptz default now()
);

-- Index
create index idx_templates_org_type on control_plane_action_templates(org_id, violation_type, enabled);

-- RLS
alter table control_plane_action_templates enable row level security;

create policy "Users can view templates for their org"
  on control_plane_action_templates for select
  using (
    org_id in (
      select org_id from user_profiles
      where user_id = auth.uid()
    )
  );

create policy "Admins can manage templates"
  on control_plane_action_templates for all
  using (
    org_id in (
      select org_id from user_profiles
      where user_id = auth.uid()
      and role in ('admin', 'owner')
    )
  );

-- ============================================================================
-- 4. Blocks (Active Enforcement)
-- ============================================================================

create table if not exists control_plane_blocks (
  id uuid primary key default gen_random_uuid(),
  violation_id uuid references control_plane_violations on delete cascade not null,
  org_id uuid not null,

  -- What's blocked
  block_type text not null, -- 'manager_assignment', 'comp_approval', 'section_opening', 'schedule_publish'
  blocked_entity_id uuid, -- manager_id, employee_id, venue_id, etc.
  blocked_entity_type text, -- 'user', 'venue', 'position'

  -- Block details
  reason text not null,
  active boolean default true,

  -- Override handling
  override_required boolean default false,
  override_authority text, -- 'gm', 'vp_ops', 'cfo'
  override_requested_at timestamptz,
  override_requested_by uuid references auth.users,
  override_request_reason text,

  -- Resolution
  lifted_at timestamptz,
  lifted_by uuid references auth.users,
  lift_reason text,

  created_at timestamptz default now()
);

-- Indexes (critical for external system lookups)
create index idx_blocks_active on control_plane_blocks(block_type, blocked_entity_id, active)
  where active = true;
create index idx_blocks_violation on control_plane_blocks(violation_id);
create index idx_blocks_org on control_plane_blocks(org_id, active);

-- RLS
alter table control_plane_blocks enable row level security;

create policy "Users can view blocks for their org"
  on control_plane_blocks for select
  using (
    org_id in (
      select org_id from user_profiles
      where user_id = auth.uid()
    )
  );

create policy "System can insert blocks"
  on control_plane_blocks for insert
  with check (true);

create policy "Users can lift blocks"
  on control_plane_blocks for update
  using (
    org_id in (
      select org_id from user_profiles
      where user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. Helper Functions
-- ============================================================================

-- Get active violations for org
create or replace function get_active_violations(p_org_id uuid, p_severity text default null)
returns table (
  id uuid,
  violation_type text,
  severity text,
  title text,
  description text,
  venue_name text,
  business_date date,
  detected_at timestamptz,
  action_count bigint,
  block_count bigint
) language sql stable as $$
  select
    v.id,
    v.violation_type,
    v.severity,
    v.title,
    v.description,
    gl.location_name as venue_name,
    v.business_date,
    v.detected_at,
    (select count(*) from control_plane_actions where violation_id = v.id) as action_count,
    (select count(*) from control_plane_blocks where violation_id = v.id and active = true) as block_count
  from control_plane_violations v
  left join general_locations gl on gl.uuid = v.venue_id
  where v.org_id = p_org_id
    and v.resolved_at is null
    and (p_severity is null or v.severity = p_severity)
  order by
    case v.severity
      when 'critical' then 1
      when 'warning' then 2
      when 'info' then 3
    end,
    v.detected_at desc;
$$;

-- Check if entity is blocked
create or replace function is_blocked(
  p_block_type text,
  p_entity_id uuid
)
returns table (
  blocked boolean,
  reason text,
  override_required boolean,
  override_authority text
) language sql stable as $$
  select
    true as blocked,
    reason,
    override_required,
    override_authority
  from control_plane_blocks
  where block_type = p_block_type
    and blocked_entity_id = p_entity_id
    and active = true
  limit 1;
$$;

-- ============================================================================
-- 6. Default Action Templates (Initial Setup)
-- ============================================================================

-- Note: These will be inserted per-org on first setup
-- Included here as reference for what templates look like

comment on table control_plane_action_templates is
'Default templates per org:
- comp_exception + critical → alert GM + block server >$50 comps
- staffing_gap + warning → alert GM + block manager from 2nd venue
- sales_pace + critical → alert GM + escalate to VP if persists
- greeting_delay + warning → alert host
';

-- ============================================================================
-- 7. Audit Logging
-- ============================================================================

-- Violations audit
create table if not exists control_plane_violations_audit (
  id uuid primary key default gen_random_uuid(),
  violation_id uuid not null,
  action text not null, -- 'created', 'resolved', 'reopened'
  changed_by uuid references auth.users,
  changed_at timestamptz default now(),
  changes jsonb
);

create index idx_violations_audit_violation on control_plane_violations_audit(violation_id);

-- Blocks audit
create table if not exists control_plane_blocks_audit (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null,
  action text not null, -- 'created', 'lifted', 'override_requested', 'override_approved'
  changed_by uuid references auth.users,
  changed_at timestamptz default now(),
  changes jsonb
);

create index idx_blocks_audit_block on control_plane_blocks_audit(block_id);
