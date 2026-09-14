-- A RPC de salvar produto passa a gravar tambem a ORIGEM de compra, na mesma
-- transacao do produto, do custo e das categorias. Fora da transacao, um save
-- que falhasse no meio deixaria produto novo sem origem — e item sem origem cai
-- no grupo "sem loja" na hora da compra, que e justamente o caso que da
-- trabalho manual.
--
-- O `drop function` da assinatura antiga e obrigatorio: sem ele o PostgREST ve
-- duas funcoes com o mesmo nome e responde "function is not unique".

drop function if exists public.save_admin_catalog_product(text, jsonb, jsonb, integer);

create or replace function public.save_admin_catalog_product(
  p_persistence_mode text,
  p_product jsonb,
  p_variation_stock jsonb,
  p_cost_cents integer,
  -- DEFAULT de proposito: o codigo em producao ainda chama esta funcao com
  -- quatro parametros. Sem o default, aplicar esta migracao antes do deploy
  -- derrubaria o salvamento de produtos no admin — a funcao antiga ja teria
  -- sido dropada e a nova exigiria um argumento que ninguem manda.
  -- Com o default, as duas versoes do codigo funcionam, e a migracao pode ir
  -- antes do deploy sem janela de quebra.
  p_supplier_sources jsonb default '[]'::jsonb
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
      size_options,
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
      array(select jsonb_array_elements_text(coalesce(p_product -> 'size_options', '[]'::jsonb))),
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
      size_options = array(select jsonb_array_elements_text(coalesce(p_product -> 'size_options', '[]'::jsonb))),
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
    size,
    quantity
  )
  select
    v_product_id,
    stock_row ->> 'variation',
    coalesce(stock_row ->> 'size', ''),
    case
      when stock_row -> 'quantity' is null or jsonb_typeof(stock_row -> 'quantity') = 'null' then null
      else (stock_row ->> 'quantity')::integer
    end
  from jsonb_array_elements(coalesce(p_variation_stock, '[]'::jsonb)) as stock_row
  on conflict (product_id, variation, size) do update
  set quantity = excluded.quantity;

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

  -- Origem de compra no fornecedor. Apaga e reinsere, como as categorias logo
  -- abaixo: o formulario manda o conjunto inteiro, entao o que nao veio foi
  -- removido pelo operador.
  --
  -- A URL fica AQUI, e nao em catalog_products, porque aquela tabela tem SELECT
  -- concedido a anon/authenticated e a policy libera todas as colunas das linhas
  -- publicadas. Ver o comentario de 20260903180000_catalog_supplier_sources.sql.
  delete from public.catalog_product_supplier_sources
  where catalog_product_supplier_sources.product_id = v_product_id;

  insert into public.catalog_product_supplier_sources (
    product_id,
    variation,
    size,
    internal_channel,
    source_store_name,
    store_key,
    source_product_url,
    source_variation_label,
    unit_cost_cents
  )
  select
    v_product_id,
    coalesce(fonte ->> 'variation', ''),
    coalesce(fonte ->> 'size', ''),
    fonte ->> 'internal_channel',
    fonte ->> 'source_store_name',
    -- A MESMA funcao que a automacao usa para agrupar. Calcular a chave aqui,
    -- e nao aceita-la do payload, e o que impede a aplicacao e o banco de
    -- discordarem sobre o que e "a mesma loja".
    public.build_supplier_store_key(
      fonte ->> 'internal_channel',
      fonte ->> 'source_store_name'
    ),
    fonte ->> 'source_product_url',
    nullif(trim(coalesce(fonte ->> 'source_variation_label', '')), ''),
    case
      when fonte ->> 'unit_cost_cents' is null then null
      else (fonte ->> 'unit_cost_cents')::integer
    end
  from jsonb_array_elements(coalesce(p_supplier_sources, '[]'::jsonb)) as fonte;

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
