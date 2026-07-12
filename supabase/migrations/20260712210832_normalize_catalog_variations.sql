begin;

-- Preserve any recorded quantities while moving legacy, unaccented labels to
-- the canonical spelling used by the admin and storefront.
insert into public.catalog_variation_stock (product_id, variation, quantity)
select
  stock.product_id,
  case lower(stock.variation)
    when 'aluminio' then 'Alumínio'
    when 'fume' then 'Fumê'
    when 'holografico' then 'Holográfico'
    when 'padrao' then 'Padrão'
  end,
  stock.quantity
from public.catalog_variation_stock as stock
where lower(stock.variation) in ('aluminio', 'fume', 'holografico', 'padrao')
on conflict (product_id, variation) do update
set quantity = coalesce(excluded.quantity, catalog_variation_stock.quantity);

delete from public.catalog_variation_stock
where lower(variation) in ('aluminio', 'fume', 'holografico', 'padrao');

update public.catalog_products as product
set variations = case
  when product.id = 'ponteira-estilo-sc' then array['Padrão']::text[]
  else (
    select coalesce(
      array_agg(deduped.variation order by deduped.first_position),
      array['Padrão']::text[]
    )
    from (
      select mapped.variation, min(mapped.position) as first_position
      from (
        select
          case
            when product.id = 'bolsinha-lateral-de-perna'
              and lower(entry.variation) = 'sob consulta' then null
            when lower(entry.variation) = 'aluminio' then 'Alumínio'
            when lower(entry.variation) = 'fume' then 'Fumê'
            when lower(entry.variation) = 'holografico' then 'Holográfico'
            when lower(entry.variation) = 'padrao' then 'Padrão'
            else entry.variation
          end as variation,
          entry.position
        from unnest(product.variations) with ordinality as entry(variation, position)
      ) as mapped
      where mapped.variation is not null
      group by mapped.variation
    ) as deduped
  )
end;

-- Remove availability/status labels and any stock row that is no longer a
-- real variation after normalization.
delete from public.catalog_variation_stock as stock
using public.catalog_products as product
where product.id = stock.product_id
  and not (stock.variation = any(product.variations));

-- Every published variation must have a matching stock row. A null quantity
-- intentionally means "Sob consulta".
insert into public.catalog_variation_stock (product_id, variation, quantity)
select product.id, variation, null
from public.catalog_products as product
cross join lateral unnest(product.variations) as variation
on conflict (product_id, variation) do nothing;

commit;
