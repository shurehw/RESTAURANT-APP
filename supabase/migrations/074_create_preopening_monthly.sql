-- Create preopening monthly fact table (stores exploded monthly schedule)

create table if not exists proforma_preopening_monthly (
  id bigserial primary key,
  scenario_id uuid not null references proforma_scenarios(id) on delete cascade,
  month_index int not null,                -- 1..N preopening months
  period_start_date date not null,
  category_id uuid not null references proforma_preopening_categories(id) on delete restrict,
  amount numeric(14,2) not null,           -- negative for cash out

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (scenario_id, month_index, category_id)
);

-- Enable RLS
alter table proforma_preopening_monthly enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can view preopening monthly for their scenarios" on proforma_preopening_monthly;
drop policy if exists "Users can manage preopening monthly for their scenarios" on proforma_preopening_monthly;

-- RLS policies
create policy "Users can view preopening monthly for their scenarios"
  on proforma_preopening_monthly for select
  using (
    scenario_id in (
      select s.id from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      where p.org_id in (
        select organization_id from organization_users
        where user_id = auth.uid() and is_active = true
      )
    )
  );

create policy "Users can manage preopening monthly for their scenarios"
  on proforma_preopening_monthly for all
  using (
    scenario_id in (
      select s.id from proforma_scenarios s
      join proforma_projects p on p.id = s.project_id
      where p.org_id in (
        select organization_id from organization_users
        where user_id = auth.uid() and is_active = true
      )
    )
  );

-- Index for fast queries
create index if not exists idx_preopening_monthly_scenario
  on proforma_preopening_monthly(scenario_id, month_index);
