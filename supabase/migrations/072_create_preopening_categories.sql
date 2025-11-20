-- Create preopening categories (collapsed version of detailed Excel structure)

create table if not exists proforma_preopening_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('OPEX','CAPEX','WORKING_CAPITAL')),
  display_order int not null,
  is_summary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index if not exists idx_preopening_categories_org
  on proforma_preopening_categories (org_id, display_order);

-- Enable RLS
alter table proforma_preopening_categories enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can view preopening categories for their organization" on proforma_preopening_categories;
drop policy if exists "Users can manage preopening categories for their organization" on proforma_preopening_categories;

-- RLS policies
create policy "Users can view preopening categories for their organization"
  on proforma_preopening_categories for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can manage preopening categories for their organization"
  on proforma_preopening_categories for all
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

-- Seed default preopening categories (to be run per org)
-- This is a template; actual seeding happens via API or script
comment on table proforma_preopening_categories is
  'Preopening capital & expense categories: COGS (initial inventory), Labor (preopening payroll), Opex (rent/utilities before opening), Marketing (preopening events), Construction (buildout), FF&E, Working Capital, Contingency';
