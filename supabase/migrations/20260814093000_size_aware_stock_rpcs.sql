-- RPCs cientes do eixo de tamanho (depende de 20260814090000_catalog_size_axis.sql).
--
-- O que muda:
-- 1. save_admin_catalog_product grava size_options no produto e size em cada
--    linha de estoque, com upsert por (product_id, variation, size) no lugar do
--    insert seco que estourava 23505 quando o payload repetia uma combinacao.
-- 2. reserve_order_stock e release_order_stock agrupam e travam por
--    (product_id, variation, size). Sem isso, duas linhas de tamanhos
--    diferentes do mesmo par fariam o SELECT ... FOR UPDATE pegar uma linha
--    arbitraria e o decremento cair no tamanho errado.
-- 3. create_checkout_order grava order_items.size.
--
-- O marcador de estoque insuficiente ganha um terceiro campo
-- (estoque_insuficiente:<produto>|<variacao>|<tamanho>). O parser em
-- src/checkout/order-backend.js foi atualizado na mesma entrega e tolera a
-- forma antiga de dois campos.
--
-- Assinaturas preservadas, entao os grants de service_role continuam valendo.
-- Os revokes/grants sao repetidos no fim como verificacao explicita.
begin;

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

-- Devolve o estoque dos itens efetivamente reservados, agora por tamanho.
create or replace function public.release_order_stock(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stock_item record;
begin
  for v_stock_item in
    select
      order_items.product_id,
      order_items.variation,
      order_items.size,
      sum(order_items.quantity)::integer as total_quantity
    from public.order_items
    where order_items.order_id = p_order_id
      and order_items.stock_reserved
    group by 1, 2, 3
    order by 1, 2, 3
  loop
    update public.catalog_variation_stock
    set quantity = catalog_variation_stock.quantity + v_stock_item.total_quantity,
      updated_at = now()
    where catalog_variation_stock.product_id = v_stock_item.product_id
      and catalog_variation_stock.variation = v_stock_item.variation
      and catalog_variation_stock.size = v_stock_item.size
      and catalog_variation_stock.quantity is not null;
  end loop;

  update public.order_items
  set stock_reserved = false
  where order_items.order_id = p_order_id
    and order_items.stock_reserved;
end;
$$;

-- Reserva estoque para os itens ainda nao reservados do pedido, travando as
-- linhas em ordem deterministica por (produto, variacao, tamanho). Linha
-- inexistente ou quantity null ("consultar disponibilidade") segue sem
-- decremento e sem flag.
create or replace function public.reserve_order_stock(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stock_item record;
  v_stock_quantity integer;
begin
  for v_stock_item in
    select
      order_items.product_id,
      order_items.variation,
      order_items.size,
      sum(order_items.quantity)::integer as total_quantity
    from public.order_items
    where order_items.order_id = p_order_id
      and not order_items.stock_reserved
    group by 1, 2, 3
    order by 1, 2, 3
  loop
    select catalog_variation_stock.quantity
    into v_stock_quantity
    from public.catalog_variation_stock
    where catalog_variation_stock.product_id = v_stock_item.product_id
      and catalog_variation_stock.variation = v_stock_item.variation
      and catalog_variation_stock.size = v_stock_item.size
    for update;

    if found and v_stock_quantity is not null then
      if v_stock_quantity < v_stock_item.total_quantity then
        raise exception 'estoque_insuficiente:%|%|%',
          v_stock_item.product_id,
          v_stock_item.variation,
          v_stock_item.size;
      end if;

      update public.catalog_variation_stock
      set quantity = v_stock_quantity - v_stock_item.total_quantity,
        updated_at = now()
      where catalog_variation_stock.product_id = v_stock_item.product_id
        and catalog_variation_stock.variation = v_stock_item.variation
        and catalog_variation_stock.size = v_stock_item.size;

      update public.order_items
      set stock_reserved = true
      where order_items.order_id = p_order_id
        and order_items.product_id = v_stock_item.product_id
        and order_items.variation = v_stock_item.variation
        and order_items.size = v_stock_item.size
        and not order_items.stock_reserved;
    end if;
  end loop;
end;
$$;

create or replace function public.create_checkout_order(
  p_user_id uuid,
  p_customer_snapshot jsonb,
  p_address_snapshot jsonb,
  p_items jsonb,
  p_totals jsonb,
  p_payment jsonb,
  p_shipping jsonb,
  p_message text,
  p_consent_snapshot jsonb,
  p_request_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_consent_id uuid := null;
  v_item jsonb;
  v_item_quantity integer;
  v_order_id uuid;
  v_order_number text;
begin
  if p_user_id is null and v_auth_user_id is not null then
    p_user_id := v_auth_user_id;
  end if;

  if p_user_id is not null and v_auth_user_id is not null and p_user_id <> v_auth_user_id then
    raise exception 'Nao e permitido criar pedido para outro usuario.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pedido sem itens.';
  end if;

  if p_user_id is not null and coalesce((p_consent_snapshot ->> 'accepted')::boolean, false) then
    insert into public.assisted_purchase_consents (
      user_id,
      consent_version,
      consent_text,
      purchase_data_use_authorized,
      ip_address,
      user_agent
    )
    values (
      p_user_id,
      p_consent_snapshot ->> 'consentVersion',
      p_consent_snapshot ->> 'consentText',
      true,
      nullif(p_request_context ->> 'ipAddress', '')::inet,
      nullif(p_request_context ->> 'userAgent', '')
    )
    returning id into v_consent_id;
  end if;

  insert into public.orders (
    user_id,
    customer_name,
    customer_email,
    customer_whatsapp,
    customer_phone,
    customer_tax_id,
    customer_snapshot,
    address_snapshot,
    subtotal_cents,
    discount_cents,
    discount_snapshot,
    shipping_cents,
    total_cents,
    currency,
    shipping_option_id,
    shipping_label,
    shipping_eta,
    payment_method_id,
    payment_method_label,
    payment_status,
    operational_status,
    attendance_channel,
    original_message,
    assisted_purchase_consent_id,
    consent_snapshot,
    customer_notes
  )
  values (
    p_user_id,
    p_customer_snapshot ->> 'name',
    nullif(p_customer_snapshot ->> 'email', ''),
    nullif(p_customer_snapshot ->> 'whatsapp', ''),
    nullif(p_customer_snapshot ->> 'phone', ''),
    nullif(p_customer_snapshot ->> 'taxId', ''),
    p_customer_snapshot,
    p_address_snapshot,
    (p_totals ->> 'subtotalCents')::integer,
    (p_totals ->> 'discountCents')::integer,
    coalesce(p_totals -> 'discountSnapshot', '{}'::jsonb),
    (p_totals ->> 'shippingCents')::integer,
    (p_totals ->> 'totalCents')::integer,
    coalesce(nullif(p_totals ->> 'currency', ''), 'BRL'),
    p_shipping ->> 'id',
    p_shipping ->> 'label',
    nullif(p_shipping ->> 'eta', ''),
    p_payment ->> 'id',
    p_payment ->> 'label',
    coalesce(nullif(p_payment ->> 'status', ''), 'aguardando_pagamento'),
    'enviado_whatsapp_business',
    'whatsapp-business',
    p_message,
    v_consent_id,
    p_consent_snapshot,
    nullif(p_customer_snapshot ->> 'notes', '')
  )
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_quantity := (v_item ->> 'quantity')::integer;

    if v_item_quantity is null or v_item_quantity <= 0 then
      raise exception 'Quantidade invalida no item do pedido.';
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      product_slug,
      product_name,
      variation,
      size,
      product_family,
      unit_price_cents,
      unit_cost_cents,
      quantity,
      subtotal_cents,
      subtotal_cost_cents,
      currency,
      storefront_category_ids,
      bike_model_scope,
      checkout_channel,
      internal_purchase_source
    )
    values (
      v_order_id,
      v_item ->> 'productId',
      v_item ->> 'productSlug',
      v_item ->> 'name',
      v_item ->> 'variation',
      coalesce(v_item ->> 'size', ''),
      v_item ->> 'productFamily',
      (v_item ->> 'unitPriceCents')::integer,
      nullif(v_item ->> 'unitCostCents', '')::integer,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'subtotalCents')::integer,
      nullif(v_item ->> 'subtotalCostCents', '')::integer,
      coalesce(nullif(v_item ->> 'currency', ''), 'BRL'),
      coalesce(
        array(select jsonb_array_elements_text(v_item -> 'storefrontCategoryIds')),
        '{}'
      ),
      coalesce(
        array(select jsonb_array_elements_text(v_item -> 'bikeModelScope')),
        '{}'
      ),
      coalesce(nullif(v_item ->> 'checkoutChannel', ''), 'whatsapp-business'),
      coalesce(v_item -> 'internalPurchaseSource', '{}'::jsonb)
    );
  end loop;

  perform public.reserve_order_stock(v_order_id);

  insert into public.payments (
    order_id,
    provider,
    payment_method_id,
    amount_cents,
    currency,
    status
  )
  values (
    v_order_id,
    'manual',
    p_payment ->> 'id',
    (p_totals ->> 'totalCents')::integer,
    coalesce(nullif(p_totals ->> 'currency', ''), 'BRL'),
    coalesce(nullif(p_payment ->> 'status', ''), 'aguardando_pagamento')
  );

  insert into public.audit_logs (
    actor_user_id,
    order_id,
    action,
    metadata
  )
  values (
    p_user_id,
    v_order_id,
    'checkout_order_created',
    jsonb_build_object(
      'attendanceChannel', 'whatsapp-business',
      'couponCode', nullif(p_totals #>> '{discountSnapshot,code}', ''),
      'operationalStatus', 'enviado_whatsapp_business',
      'paymentStatus', coalesce(nullif(p_payment ->> 'status', ''), 'aguardando_pagamento')
    )
  );

  return jsonb_build_object(
    'id', v_order_id,
    'orderNumber', v_order_number,
    'operationalStatus', 'enviado_whatsapp_business',
    'paymentStatus', coalesce(nullif(p_payment ->> 'status', ''), 'aguardando_pagamento')
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

revoke all on function public.release_order_stock(uuid) from public;
revoke all on function public.release_order_stock(uuid) from anon;
revoke all on function public.release_order_stock(uuid) from authenticated;
grant execute on function public.release_order_stock(uuid) to service_role;

revoke all on function public.reserve_order_stock(uuid) from public;
revoke all on function public.reserve_order_stock(uuid) from anon;
revoke all on function public.reserve_order_stock(uuid) from authenticated;
grant execute on function public.reserve_order_stock(uuid) to service_role;

revoke all on function public.create_checkout_order(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
) from public;

revoke all on function public.create_checkout_order(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
) from anon;

revoke all on function public.create_checkout_order(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
) from authenticated;

grant execute on function public.create_checkout_order(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  jsonb,
  jsonb
) to service_role;

commit;
