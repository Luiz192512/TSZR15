begin;

alter table public.catalog_products
  add column if not exists variation_images jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_products_variation_images_array_check'
  ) then
    alter table public.catalog_products
      add constraint catalog_products_variation_images_array_check
      check (jsonb_typeof(variation_images) = 'array');
  end if;
end $$;

update public.catalog_products as product
set variation_images = coalesce(
  (
    select jsonb_agg(
      jsonb_build_object(
        'variation', variation_row.variation,
        'image_urls',
        case
          when variation_row.position = 1 then
            to_jsonb(
              array(
                select image_row.image_url
                from unnest(product.image_urls) with ordinality
                  as image_row(image_url, position)
                where image_row.position = 1
                   or image_row.position > cardinality(product.variations)
                order by image_row.position
              )
            )
          when product.image_urls[variation_row.position] is not null then
            to_jsonb(array[product.image_urls[variation_row.position]])
          else '[]'::jsonb
        end
      )
      order by variation_row.position
    )
    from unnest(product.variations) with ordinality
      as variation_row(variation, position)
  ),
  '[]'::jsonb
)
where product.variation_images = '[]'::jsonb
  and cardinality(product.variations) > 0;

commit;
