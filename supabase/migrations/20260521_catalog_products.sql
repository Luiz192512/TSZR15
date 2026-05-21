create table if not exists public.catalog_categories (
  id text primary key,
  label text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_products (
  id text primary key,
  slug text not null unique,
  name text not null,
  storefront_category_ids text[] not null default '{}',
  product_family text not null,
  bike_model_scope text[] not null default '{}',
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'BRL',
  variations text[] not null default '{}',
  availability text not null default 'sob-consulta',
  lead_time_days integer not null default 2 check (lead_time_days >= 0),
  shipping_class text not null default 'medium',
  checkout_channel text not null default 'whatsapp-business',
  internal_purchase_source jsonb not null default '{}'::jsonb,
  notes text not null default '',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_products_currency_check check (currency = 'BRL'),
  constraint catalog_products_checkout_channel_check check (checkout_channel = 'whatsapp-business'),
  constraint catalog_products_storefront_categories_check check (array_length(storefront_category_ids, 1) >= 1),
  constraint catalog_products_variations_check check (array_length(variations, 1) >= 1)
);

create table if not exists public.catalog_product_categories (
  product_id text not null references public.catalog_products(id) on delete cascade,
  category_id text not null references public.catalog_categories(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);

create index if not exists catalog_products_slug_idx on public.catalog_products(slug);
create index if not exists catalog_products_published_idx on public.catalog_products(is_published);
create index if not exists catalog_products_category_ids_idx
on public.catalog_products using gin(storefront_category_ids);
create index if not exists catalog_product_categories_category_idx
on public.catalog_product_categories(category_id);

drop trigger if exists catalog_categories_set_updated_at on public.catalog_categories;
create trigger catalog_categories_set_updated_at
before update on public.catalog_categories
for each row execute function public.set_updated_at();

drop trigger if exists catalog_products_set_updated_at on public.catalog_products;
create trigger catalog_products_set_updated_at
before update on public.catalog_products
for each row execute function public.set_updated_at();

alter table public.catalog_categories enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_product_categories enable row level security;

drop policy if exists "Public can view visible catalog categories" on public.catalog_categories;
create policy "Public can view visible catalog categories"
on public.catalog_categories for select
using (is_visible = true);

drop policy if exists "Public can view published catalog products" on public.catalog_products;
create policy "Public can view published catalog products"
on public.catalog_products for select
using (is_published = true);

drop policy if exists "Public can view published product categories" on public.catalog_product_categories;
create policy "Public can view published product categories"
on public.catalog_product_categories for select
using (
  exists (
    select 1
    from public.catalog_products
    where catalog_products.id = catalog_product_categories.product_id
      and catalog_products.is_published = true
  )
);
