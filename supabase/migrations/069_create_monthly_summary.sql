-- Create monthly summary table for cash flow and key metrics

create table if not exists proforma_monthly_summary (
  id bigserial primary key,
  scenario_id uuid not null references proforma_scenarios(id) on delete cascade,
  month_index int not null,
  period_start_date date not null,

  -- Revenue
  total_revenue numeric(14,2) not null,
  food_revenue numeric(14,2) not null,
  bev_revenue numeric(14,2) not null,
  other_revenue numeric(14,2) not null,

  -- Costs
  total_cogs numeric(14,2) not null,
  total_labor numeric(14,2) not null,
  total_opex numeric(14,2) not null,

  -- P&L
  gross_profit numeric(14,2) not null,
  ebitda numeric(14,2) not null,
  debt_service numeric(14,2) not null,
  net_income numeric(14,2) not null,

  -- Cash flow
  cash_flow numeric(14,2) not null,          -- ebitda - debt_service (simple v1)
  cumulative_cash numeric(14,2) not null,

  -- Operational metrics
  total_covers numeric(10,2) not null,

  created_at timestamptz not null default now(),

  unique (scenario_id, month_index)
);

create index if not exists idx_proforma_monthly_summary_scenario
  on proforma_monthly_summary (scenario_id, month_index);

-- Enable RLS
alter table proforma_monthly_summary enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can view monthly summary for their scenarios" on proforma_monthly_summary;
drop policy if exists "System can insert monthly summary" on proforma_monthly_summary;

-- RLS policies
create policy "Users can view monthly summary for their scenarios"
  on proforma_monthly_summary for select
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

create policy "System can insert monthly summary"
  on proforma_monthly_summary for insert
  with check (true);

create policy "System can delete monthly summary"
  on proforma_monthly_summary for delete
  using (true);
