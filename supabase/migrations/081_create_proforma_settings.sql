-- Create proforma settings table for organization-level defaults
create table if not exists proforma_settings (
  org_id uuid primary key references organizations(id) on delete cascade,

  -- Seating density benchmarks (can be customized per org)
  default_density_benchmark text not null default 'casual-dining',

  -- Bar calculation settings
  bar_lf_ratio numeric(5,4) not null default 0.0200, -- FOH sq ft → bar linear feet
  bar_min_lf numeric(5,2) not null default 22,
  bar_max_lf numeric(5,2) not null default 50,
  bar_inches_per_seat numeric(5,2) not null default 24,
  bar_max_pct_of_dining numeric(5,2) not null default 25, -- Max % of dining seats

  -- Default projection settings
  default_projection_years int not null default 5,
  default_sf_per_seat numeric(6,2) not null default 20,
  default_dining_area_pct numeric(5,2) not null default 65,
  default_boh_pct numeric(5,2) not null default 30,

  -- COGS defaults
  default_food_cogs_pct numeric(5,2) not null default 28,
  default_bev_cogs_pct numeric(5,2) not null default 22,
  default_other_cogs_pct numeric(5,2) not null default 20,

  -- Labor productivity defaults
  default_foh_hours_per_100_covers numeric(6,2) not null default 12,
  default_boh_hours_per_100_covers numeric(6,2) not null default 8,
  default_foh_hourly_rate numeric(10,2) not null default 18,
  default_boh_hourly_rate numeric(10,2) not null default 20,
  default_payroll_burden_pct numeric(5,2) not null default 25,

  -- OpEx defaults
  default_linen_pct numeric(5,2) not null default 1.5,
  default_smallwares_pct numeric(5,2) not null default 1.0,
  default_cleaning_pct numeric(5,2) not null default 0.5,
  default_cc_fees_pct numeric(5,2) not null default 2.5,
  default_marketing_pct numeric(5,2) not null default 3.0,
  default_gna_pct numeric(5,2) not null default 5.0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table proforma_settings enable row level security;

-- RLS policies
create policy "Users can view settings for their organization"
  on proforma_settings for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can update settings for their organization"
  on proforma_settings for update
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "System can insert settings"
  on proforma_settings for insert
  with check (true);

-- Create default settings for existing organizations
insert into proforma_settings (org_id)
select id from organizations
on conflict (org_id) do nothing;
