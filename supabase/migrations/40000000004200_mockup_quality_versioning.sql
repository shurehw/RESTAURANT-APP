-- Mockup quality presets + template versioning + reproducible render logs

create table if not exists mockup_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category text not null,
  is_active boolean not null default true,
  current_version integer not null default 1,
  default_quality_preset text not null default 'fast'
    check (default_quality_preset in ('fast', 'premium')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mockup_templates_org on mockup_templates(org_id);
create unique index if not exists uq_mockup_templates_org_name on mockup_templates(org_id, name);

create table if not exists mockup_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references mockup_templates(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  version integer not null check (version > 0),
  prompt text not null,
  quality_fast jsonb not null default '{}'::jsonb,
  quality_premium jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(template_id, version)
);

create index if not exists idx_mockup_template_versions_template on mockup_template_versions(template_id, version desc);
create index if not exists idx_mockup_template_versions_org on mockup_template_versions(org_id);

create table if not exists mockup_renders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  template_id uuid not null references mockup_templates(id) on delete restrict,
  template_version_id uuid not null references mockup_template_versions(id) on delete restrict,
  template_version integer not null,
  quality_preset text not null check (quality_preset in ('fast', 'premium')),
  credits_used integer not null default 5,
  provider text,
  provider_model text,
  logo_asset_url text,
  output_image_url text,
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  error_message text,
  render_seconds integer,
  prompt_snapshot text not null,
  settings_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_mockup_renders_org_created on mockup_renders(org_id, created_at desc);
create index if not exists idx_mockup_renders_template on mockup_renders(template_id, created_at desc);

create or replace function set_mockup_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mockup_templates_updated_at on mockup_templates;
create trigger trg_mockup_templates_updated_at
before update on mockup_templates
for each row
execute function set_mockup_updated_at();

alter table mockup_templates enable row level security;
alter table mockup_template_versions enable row level security;
alter table mockup_renders enable row level security;

drop policy if exists "Users can view mockup templates for their org" on mockup_templates;
create policy "Users can view mockup templates for their org"
  on mockup_templates for select
  using (
    org_id in (
      select ou.organization_id
      from organization_users ou
      where ou.user_id = auth.uid()
    )
    or is_super_admin()
  );

drop policy if exists "Admins can manage mockup templates" on mockup_templates;
create policy "Admins can manage mockup templates"
  on mockup_templates for all
  using (
    org_id in (
      select ou.organization_id
      from organization_users ou
      where ou.user_id = auth.uid()
        and ou.role in ('owner', 'admin')
    )
    or is_super_admin()
  );

drop policy if exists "Users can view mockup template versions for their org" on mockup_template_versions;
create policy "Users can view mockup template versions for their org"
  on mockup_template_versions for select
  using (
    org_id in (
      select ou.organization_id
      from organization_users ou
      where ou.user_id = auth.uid()
    )
    or is_super_admin()
  );

drop policy if exists "Admins can manage mockup template versions" on mockup_template_versions;
create policy "Admins can manage mockup template versions"
  on mockup_template_versions for all
  using (
    org_id in (
      select ou.organization_id
      from organization_users ou
      where ou.user_id = auth.uid()
        and ou.role in ('owner', 'admin')
    )
    or is_super_admin()
  );

drop policy if exists "Users can view mockup renders for their org" on mockup_renders;
create policy "Users can view mockup renders for their org"
  on mockup_renders for select
  using (
    org_id in (
      select ou.organization_id
      from organization_users ou
      where ou.user_id = auth.uid()
    )
    or is_super_admin()
  );

drop policy if exists "Users can create mockup renders for their org" on mockup_renders;
create policy "Users can create mockup renders for their org"
  on mockup_renders for insert
  with check (
    org_id in (
      select ou.organization_id
      from organization_users ou
      where ou.user_id = auth.uid()
    )
    or is_super_admin()
  );

