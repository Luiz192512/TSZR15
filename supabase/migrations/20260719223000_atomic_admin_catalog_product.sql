create or replace function public.save_admin_catalog_product(
  p_persistence_mode text,
  p_product jsonb,
  p_variation_stock jsonb,
  p_cost_cents integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_locked_product_id text;
  v_product_id text := nullif(trim(p_product ->> 'id'), '');
  v_slug text := nullif(trim(p_product ->> 'slug'), '');
begin
  if p_persistence_mode is null or p_persistence_mode not in ('create', 'update') then
    raise exception 'Modo de persistencia de produto invalido.';
  end if;

  if p_product is null or jsonb_typeof(p_product) <> 'object' then
    raise exception 'Dados do produto invalidos.';
  end if;

  if v_product_id is null or v_slug is null then
    raise exception 'Produto sem identificador ou slug.';
  end if;

  if jsonb_typeof(coalesce(p_variation_stock, '[]'::jsonb)) <> 'array' then
    raise exception 'Estoque de variacoes invalido.';
  end if;

  if p_persistence_mode = 'create' then
    insert into public.catalog_products (
      id,
      slug,
      name,
      storefront_category_ids,
      product_family,
      bike_model_scope,
      price_cents,
      currency,
      variations,
      availability,
      lead_time_days,
      shipping_class,
      image_urls,
      variation_images,
      checkout_channel,
      internal_purchase_source,
      notes,
      is_published
    )
    values (
      v_product_id,
      v_slug,
      p_product ->> 'name',
      array(select jsonb_array_elements_text(coalesce(p_product -> 'storefront_category_ids', '[]'::jsonb))),
      p_product ->> 'product_family',
      array(select jsonb_array_elements_text(coalesce(p_product -> 'bike_model_scope', '[]'::jsonb))),
      (p_product ->> 'price_cents')::integer,
      coalesce(nullif(p_product ->> 'currency', ''), 'BRL'),
      array(select jsonb_array_elements_text(coalesce(p_product -> 'variations', '[]'::jsonb))),
      coalesce(nullif(p_product ->> 'availability', ''), 'sob-consulta'),
      coalesce((p_product ->> 'lead_time_days')::integer, 2),
      coalesce(nullif(p_product ->> 'shipping_class', ''), 'medium'),
      array(select jsonb_array_elements_text(coalesce(p_product -> 'image_urls', '[]'::jsonb))),
      coalesce(p_product -> 'variation_images', '[]'::jsonb),
      coalesce(nullif(p_product ->> 'checkout_channel', ''), 'whatsapp-business'),
      coalesce(p_product -> 'internal_purchase_source', '{}'::jsonb),
      coalesce(p_product ->> 'notes', ''),
      coalesce((p_product ->> 'is_published')::boolean, true)
    );
  else
    select catalog_products.id
    into v_locked_product_id
    from public.catalog_products
    where catalog_products.id = v_product_id
    for update;

    if not found then
      raise exception 'Produto nao encontrado.';
    end if;

    update public.catalog_products
    set
      slug = v_slug,
      name = p_product ->> 'name',
      storefront_category_ids = array(select jsonb_array_elements_text(coalesce(p_product -> 'storefront_category_ids', '[]'::jsonb))),
      product_family = p_product ->> 'product_family',
      bike_model_scope = array(select jsonb_array_elements_text(coalesce(p_product -> 'bike_model_scope', '[]'::jsonb))),
      price_cents = (p_product ->> 'price_cents')::integer,
      currency = coalesce(nullif(p_product ->> 'currency', ''), 'BRL'),
      variations = array(select jsonb_array_elements_text(coalesce(p_product -> 'variations', '[]'::jsonb))),
      availability = coalesce(nullif(p_product ->> 'availability', ''), 'sob-consulta'),
      lead_time_days = coalesce((p_product ->> 'lead_time_days')::integer, 2),
      shipping_class = coalesce(nullif(p_product ->> 'shipping_class', ''), 'medium'),
      image_urls = array(select jsonb_array_elements_text(coalesce(p_product -> 'image_urls', '[]'::jsonb))),
      variation_images = coalesce(p_product -> 'variation_images', '[]'::jsonb),
      checkout_channel = coalesce(nullif(p_product ->> 'checkout_channel', ''), 'whatsapp-business'),
      internal_purchase_source = coalesce(p_product -> 'internal_purchase_source', '{}'::jsonb),
      notes = coalesce(p_product ->> 'notes', ''),
      is_published = coalesce((p_product ->> 'is_published')::boolean, true)
    where catalog_products.id = v_product_id;
  end if;

  delete from public.catalog_variation_stock
  where catalog_variation_stock.product_id = v_product_id;

  insert into public.catalog_variation_stock (
    product_id,
    variation,
    quantity
  )
  select
    v_product_id,
    stock_row ->> 'variation',
    case
      when stock_row -> 'quantity' is null or jsonb_typeof(stock_row -> 'quantity') = 'null' then null
      else (stock_row ->> 'quantity')::integer
    end
  from jsonb_array_elements(coalesce(p_variation_stock, '[]'::jsonb)) as stock_row;

  if p_cost_cents is null then
    delete from public.catalog_product_costs
    where catalog_product_costs.product_id = v_product_id;
  else
    insert into public.catalog_product_costs (
      product_id,
      cost_cents,
      currency
    )
    values (
      v_product_id,
      p_cost_cents,
      'BRL'
    )
    on conflict (product_id) do update
    set
      cost_cents = excluded.cost_cents,
      currency = excluded.currency;
  end if;

  delete from public.catalog_product_categories
  where catalog_product_categories.product_id = v_product_id;

  insert into public.catalog_product_categories (
    product_id,
    category_id
  )
  select
    v_product_id,
    category_rows.category_id
  from jsonb_array_elements_text(
    coalesce(p_product -> 'storefront_category_ids', '[]'::jsonb)
  ) as category_rows(category_id);

  return jsonb_build_object(
    'id', v_product_id,
    'slug', v_slug
  );
end;
$$;

revoke all on function public.save_admin_catalog_product(
  text,
  jsonb,
  jsonb,
  integer
) from public;

revoke all on function public.save_admin_catalog_product(
  text,
  jsonb,
  jsonb,
  integer
) from anon;

revoke all on function public.save_admin_catalog_product(
  text,
  jsonb,
  jsonb,
  integer
) from authenticated;

grant execute on function public.save_admin_catalog_product(
  text,
  jsonb,
  jsonb,
  integer
) to service_role;
