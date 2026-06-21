create table if not exists public.catalog_variation_stock (
  product_id text not null references public.catalog_products(id) on delete cascade,
  variation text not null,
  quantity integer,
  updated_at timestamptz not null default now(),
  primary key (product_id, variation),
  constraint catalog_variation_stock_quantity_check check (quantity is null or quantity >= 0)
);

create index if not exists catalog_variation_stock_product_idx
on public.catalog_variation_stock(product_id);

insert into public.catalog_variation_stock (product_id, variation)
select product.id, variation
from public.catalog_products as product
cross join lateral unnest(product.variations) as variation
on conflict (product_id, variation) do nothing;

drop trigger if exists catalog_variation_stock_set_updated_at on public.catalog_variation_stock;
create trigger catalog_variation_stock_set_updated_at
before update on public.catalog_variation_stock
for each row execute function public.set_updated_at();

alter table public.catalog_variation_stock enable row level security;

grant select on public.catalog_variation_stock to anon, authenticated;

drop policy if exists "Public can view published variation stock" on public.catalog_variation_stock;
create policy "Public can view published variation stock"
on public.catalog_variation_stock for select
using (
  exists (
    select 1
    from public.catalog_products
    where catalog_products.id = catalog_variation_stock.product_id
      and catalog_products.is_published = true
  )
);
