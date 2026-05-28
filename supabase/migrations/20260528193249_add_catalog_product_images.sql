alter table public.catalog_products
  add column if not exists image_urls text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_products_image_urls_limit_check'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_image_urls_limit_check
      check (cardinality(image_urls) <= 12);
  end if;
end $$;
