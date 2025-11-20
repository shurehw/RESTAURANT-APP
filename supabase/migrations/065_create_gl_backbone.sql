-- Create GL accounts table
-- This represents the chart of accounts that maps to proforma categories

create table if not exists gl_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  external_code text,         -- GL number from R365/QBO if/when you have it
  name text not null,         -- e.g. 'Food Sales'
  section text not null check (section in (
    'Sales','COGS','Labor','Opex','BelowTheLine','Summary'
  )),
  is_summary boolean not null default false,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists idx_gl_accounts_org_section
  on gl_accounts (org_id, section, display_order);

create index if not exists idx_gl_accounts_org_external_code
  on gl_accounts (org_id, external_code)
  where external_code is not null;

-- Create GL account to category mapping table
-- This maps GL accounts to proforma categories (many-to-many with weights)

create table if not exists gl_account_category_map (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  gl_account_id uuid not null references gl_accounts(id) on delete cascade,
  category_id uuid not null references proforma_categories(id) on delete restrict,
  weight numeric(5,2) not null default 100.0, -- in case you ever split one GL across cats
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gl_account_id, category_id)
);

create index if not exists idx_gl_account_category_map_org
  on gl_account_category_map (org_id);

create index if not exists idx_gl_account_category_map_gl
  on gl_account_category_map (gl_account_id);

create index if not exists idx_gl_account_category_map_category
  on gl_account_category_map (category_id);

-- Enable RLS
alter table gl_accounts enable row level security;
alter table gl_account_category_map enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can view GL accounts for their organization" on gl_accounts;
drop policy if exists "Users can insert GL accounts for their organization" on gl_accounts;
drop policy if exists "Users can update GL accounts for their organization" on gl_accounts;
drop policy if exists "Users can delete GL accounts for their organization" on gl_accounts;
drop policy if exists "Users can view GL category mappings for their organization" on gl_account_category_map;
drop policy if exists "Users can insert GL category mappings for their organization" on gl_account_category_map;
drop policy if exists "Users can update GL category mappings for their organization" on gl_account_category_map;
drop policy if exists "Users can delete GL category mappings for their organization" on gl_account_category_map;

-- RLS policies for gl_accounts
create policy "Users can view GL accounts for their organization"
  on gl_accounts for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can insert GL accounts for their organization"
  on gl_accounts for insert
  with check (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can update GL accounts for their organization"
  on gl_accounts for update
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can delete GL accounts for their organization"
  on gl_accounts for delete
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

-- RLS policies for gl_account_category_map
create policy "Users can view GL category mappings for their organization"
  on gl_account_category_map for select
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can insert GL category mappings for their organization"
  on gl_account_category_map for insert
  with check (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can update GL category mappings for their organization"
  on gl_account_category_map for update
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "Users can delete GL category mappings for their organization"
  on gl_account_category_map for delete
  using (
    org_id in (
      select organization_id from organization_users
      where user_id = auth.uid() and is_active = true
    )
  );
