-- Create preopening monthly fact table (stores exploded monthly schedule)

create table if not exists proforma_preopening_monthly (
  id bigserial primary key,
  scenario_id uuid not null references proforma_scenarios(id) on delete cascade,
  month_index int not null check (month_index > 0),  -- 1..N preopening months (1 = first month)
  period_start_date date not null,                    -- First day of the month for this period
  category_id uuid not null references proforma_preopening_categories(id) on delete restrict,
  amount numeric(14,2) not null,                     -- negative for cash out (expenses)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (scenario_id, month_index, category_id)
);

comment on table proforma_preopening_monthly is
  'Stores exploded monthly schedule of preopening expenses. Each row represents one category''s amount for one month. month_index is 1-based (1 = first preopening month).';

comment on column proforma_preopening_monthly.month_index is
  '1-based month index within the preopening phase (1 = first month, 2 = second month, etc.)';

comment on column proforma_preopening_monthly.period_start_date is
  'First day of the calendar month for this period. Should match the month_index relative to preopening_start_month.';

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

-- Additional index for category-based queries
create index if not exists idx_preopening_monthly_category
  on proforma_preopening_monthly(category_id);

-- Auto-update timestamp trigger
create or replace function update_preopening_monthly_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Drop existing trigger if any
drop trigger if exists trg_preopening_monthly_updated_at on proforma_preopening_monthly;

create trigger trg_preopening_monthly_updated_at
  before update on proforma_preopening_monthly
  for each row
  execute function update_preopening_monthly_updated_at();
