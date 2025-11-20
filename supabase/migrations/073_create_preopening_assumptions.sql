-- Create preopening assumptions table (high-level inputs)

create table if not exists proforma_preopening_assumptions (
  scenario_id uuid primary key references proforma_scenarios(id) on delete cascade,

  -- Duration
  duration_months int not null default 12,

  -- Capital & Expense Totals
  total_construction numeric(14,2) default 0,
  total_ffne numeric(14,2) default 0,                              -- FF&E (furniture, fixtures, equipment)
  total_initial_inventory_fnb numeric(14,2) default 0,            -- Initial food & beverage order
  total_initial_inventory_other numeric(14,2) default 0,          -- Merch, retail, etc.
  total_preopening_payroll_fixed numeric(14,2) default 0,         -- Salaried staff before opening
  total_preopening_payroll_variable numeric(14,2) default 0,      -- Hourly staff (training, setup)
  total_preopening_payroll_taxes numeric(14,2) default 0,         -- Taxes, benefits, workers comp
  total_preopening_opex_operating numeric(14,2) default 0,        -- Menu/printing, IT, janitorial, licenses
  total_preopening_opex_occupancy numeric(14,2) default 0,        -- Lease acquisition, rent, property tax
  total_preopening_opex_gna numeric(14,2) default 0,              -- Legal, travel, misc
  total_preopening_marketing numeric(14,2) default 0,             -- Preopening marketing, F&F, party
  total_preopening_training numeric(14,2) default 0,              -- Staff training, uniforms, materials
  total_preopening_opening_order numeric(14,2) default 0,         -- Paper, decorations, cleaning for opening
  total_preopening_kitchen_bar numeric(14,2) default 0,           -- Glassware, smallwares, china, bar tools
  total_working_capital numeric(14,2) default 0,
  total_contingency numeric(14,2) default 0,
  total_preopening_management_fees numeric(14,2) default 0,       -- Preopening mgmt fees if any

  -- Distribution patterns (how to spread totals across months)
  construction_distribution text default 'back_loaded' check (construction_distribution in ('front','back_loaded','even','custom')),
  ffne_distribution text default 'back_loaded' check (ffne_distribution in ('front','back_loaded','even','custom')),
  payroll_fixed_distribution text default 'even' check (payroll_fixed_distribution in ('front','even','ramp','custom')),
  payroll_variable_distribution text default 'ramp' check (payroll_variable_distribution in ('front','even','ramp','custom')),
  marketing_distribution text default 'late' check (marketing_distribution in ('front','even','late','custom')),
  inventory_distribution text default 'at_opening' check (inventory_distribution in ('front','even','at_opening','custom')),

  -- Custom distribution curves (optional JSONB arrays of weights)
  custom_distributions jsonb default null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table proforma_preopening_assumptions enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can view preopening assumptions for their scenarios" on proforma_preopening_assumptions;
drop policy if exists "Users can manage preopening assumptions for their scenarios" on proforma_preopening_assumptions;

-- RLS policies
create policy "Users can view preopening assumptions for their scenarios"
  on proforma_preopening_assumptions for select
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

create policy "Users can manage preopening assumptions for their scenarios"
  on proforma_preopening_assumptions for all
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
