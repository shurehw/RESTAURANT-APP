-- Competitor pricing tables backing the dashboard custom catalog products UI.
-- These were missing from the active migration chain, leaving
-- /products/competitor-pricing pointed at non-existent tables.

create table if not exists public.custom_catalog_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  name text not null,
  sku text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_catalog_products_org
  on public.custom_catalog_products (organization_id);

create index if not exists idx_custom_catalog_products_name
  on public.custom_catalog_products (name);

create table if not exists public.competitor_products_scraped (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  competitor_name text not null,
  product_name text not null,
  variant text,
  category text,
  min_qty integer,
  unit_price numeric(12, 4),
  source_url text,
  scraped_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_competitor_products_scraped_org
  on public.competitor_products_scraped (organization_id);

create index if not exists idx_competitor_products_scraped_competitor
  on public.competitor_products_scraped (competitor_name);

create index if not exists idx_competitor_products_scraped_product
  on public.competitor_products_scraped (product_name);

create table if not exists public.custom_product_competitor_pricing (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  custom_product_id uuid not null references public.custom_catalog_products(id) on delete cascade,
  competitor_name text not null,
  product_name text,
  variant text,
  category text,
  min_qty integer,
  unit_price numeric(12, 4),
  source_url text,
  scraped_at timestamptz,
  imported_from_scraped_id uuid references public.competitor_products_scraped(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_product_comp_pricing_org
  on public.custom_product_competitor_pricing (organization_id);

create index if not exists idx_custom_product_comp_pricing_product
  on public.custom_product_competitor_pricing (custom_product_id);

create index if not exists idx_custom_product_comp_pricing_scraped
  on public.custom_product_competitor_pricing (imported_from_scraped_id);
