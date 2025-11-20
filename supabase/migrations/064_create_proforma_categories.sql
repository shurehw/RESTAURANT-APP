-- Create proforma_categories table
-- This is the canonical set of P&L lines that the proforma engine works with

create table if not exists proforma_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,          -- e.g. 'SALES_FOOD'
  name text not null,          -- e.g. 'Food Sales'
  section text not null check (section in (
    'SALES','COGS','LABOR','OPEX','BELOW_THE_LINE','SUMMARY'
  )),
  display_order int not null,  -- for P&L order
  is_summary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index if not exists idx_proforma_categories_org_order
  on proforma_categories (org_id, display_order);

create index if not exists idx_proforma_categories_org_section
  on proforma_categories (org_id, section);

-- Enable RLS
alter table proforma_categories enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can view proforma categories for their organization" on proforma_categories;
drop policy if exists "Users can insert proforma categories for their organization" on proforma_categories;
drop policy if exists "Users can update proforma categories for their organization" on proforma_categories;
drop policy if exists "Users can delete proforma categories for their organization" on proforma_categories;

-- RLS policies
create policy "Users can view proforma categories for their organization"
  on proforma_categories for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can insert proforma categories for their organization"
  on proforma_categories for insert
  with check (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can update proforma categories for their organization"
  on proforma_categories for update
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can delete proforma categories for their organization"
  on proforma_categories for delete
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );
