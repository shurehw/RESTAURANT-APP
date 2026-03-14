-- =============================================================================
-- saved_searches: Bookmarked search results for restaurant scouting/research
-- =============================================================================

create table if not exists public.saved_searches (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid not null,  -- auth.users id
  title         text not null,
  url           text,
  snippet       text,
  source        text not null default 'serper',  -- serper, manual
  image_url     text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indexes
create index idx_saved_searches_org on public.saved_searches(organization_id);
create index idx_saved_searches_user on public.saved_searches(user_id);
create index idx_saved_searches_created on public.saved_searches(created_at desc);

-- RLS
alter table public.saved_searches enable row level security;

-- Users can see their own org's saved searches
create policy "saved_searches_select"
  on public.saved_searches for select
  using (
    organization_id in (
      select organization_id from public.organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

-- Users can insert their own bookmarks
create policy "saved_searches_insert"
  on public.saved_searches for insert
  with check (
    user_id = auth.uid()
    and organization_id in (
      select organization_id from public.organization_users
      where user_id = auth.uid() and is_active = true
    )
  );

-- Users can update their own bookmarks
create policy "saved_searches_update"
  on public.saved_searches for update
  using (user_id = auth.uid());

-- Users can delete their own bookmarks
create policy "saved_searches_delete"
  on public.saved_searches for delete
  using (user_id = auth.uid());
