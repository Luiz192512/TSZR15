-- Endurecimento da reserva de estoque (review Codex do PR #50):
-- 1. order_items.stock_reserved registra quais itens de fato decrementaram
--    estoque, para devolucao nunca creditar reserva que nao aconteceu
--    (inclui pedidos criados antes da reserva existir: flag default false).
-- 2. Locks de estoque em ordem deterministica (product_id, variation) para
--    dois checkouts concorrentes nao se abortarem por deadlock.
-- 3. Status interno 'recusado' tambem libera/re-reserva estoque, via RPC
--    transacional propria.
-- 4. create_checkout_order deixa de ser executavel por authenticated: o
--    caminho unico passa a ser o service role do servidor (fecha o vetor de
--    chamada direta da RPC e o permission denied do FOR UPDATE como invoker
--    authenticated).

alter table public.order_items
  add column if not exists stock_reserved boolean not null default false;

-- Devolve ao estoque somente o que os itens do pedido reservaram de fato e
-- limpa a flag, tornando qualquer caminho de liberacao idempotente.
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
      sum(order_items.quantity)::integer as total_quantity
    from public.order_items
    where order_items.order_id = p_order_id
      and order_items.stock_reserved
    group by 1, 2
    order by 1, 2
  loop
    update public.catalog_variation_stock
    set quantity = catalog_variation_stock.quantity + v_stock_item.total_quantity,
      updated_at = now()
    where catalog_variation_stock.product_id = v_stock_item.product_id
      and catalog_variation_stock.variation = v_stock_item.variation
      and catalog_variation_stock.quantity is not null;
  end loop;

  update public.order_items
  set stock_reserved = false
  where order_items.order_id = p_order_id
    and order_items.stock_reserved;
end;
$$;

-- Reserva estoque para os itens ainda nao reservados do pedido, travando as
-- linhas em ordem deterministica. Linha inexistente ou quantity null
-- ("consultar disponibilidade") segue sem decremento e sem flag.
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
      sum(order_items.quantity)::integer as total_quantity
    from public.order_items
    where order_items.order_id = p_order_id
      and not order_items.stock_reserved
    group by 1, 2
    order by 1, 2
  loop
    select catalog_variation_stock.quantity
    into v_stock_quantity
    from public.catalog_variation_stock
    where catalog_variation_stock.product_id = v_stock_item.product_id
      and catalog_variation_stock.variation = v_stock_item.variation
    for update;

    if found and v_stock_quantity is not null then
      if v_stock_quantity < v_stock_item.total_quantity then
        raise exception 'estoque_insuficiente:%|%', v_stock_item.product_id, v_stock_item.variation;
      end if;

      update public.catalog_variation_stock
      set quantity = v_stock_quantity - v_stock_item.total_quantity,
        updated_at = now()
      where catalog_variation_stock.product_id = v_stock_item.product_id
        and catalog_variation_stock.variation = v_stock_item.variation;

      update public.order_items
      set stock_reserved = true
      where order_items.order_id = p_order_id
        and order_items.product_id = v_stock_item.product_id
        and order_items.variation = v_stock_item.variation
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

create or replace function public.save_admin_order_operation(
  p_order_id uuid,
  p_order_number text,
  p_operation_id uuid,
  p_order jsonb,
  p_payment jsonb,
  p_supplier_purchase_id uuid,
  p_supplier jsonb,
  p_tracking jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_audit_log_id uuid;
  v_operational_status text := nullif(p_order ->> 'operationalStatus', '');
  v_order_number text;
  v_payment_count integer := 0;
  v_payment_status text := nullif(p_order ->> 'paymentStatus', '');
  v_previous_operational_status text;
  v_previous_result jsonb;
  v_result jsonb;
  v_supplier_purchase_id uuid := p_supplier_purchase_id;
begin
  if p_operation_id is null then
    raise exception 'Identificador da operacao invalido.';
  end if;

  select orders.order_number, orders.operational_status
  into v_order_number, v_previous_operational_status
  from public.orders
  where orders.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido nao encontrado.';
  end if;

  if nullif(trim(p_order_number), '') is not null
    and upper(trim(p_order_number)) <> upper(v_order_number) then
    raise exception 'O numero do pedido nao corresponde ao pedido selecionado.';
  end if;

  insert into public.audit_logs (
    action,
    metadata,
    operation_id,
    order_id
  )
  values (
    'admin_order_update_started',
    '{}'::jsonb,
    p_operation_id,
    p_order_id
  )
  on conflict (operation_id) where operation_id is not null do nothing
  returning audit_logs.id into v_audit_log_id;

  if v_audit_log_id is null then
    select audit_logs.metadata -> 'result'
    into v_previous_result
    from public.audit_logs
    where audit_logs.operation_id = p_operation_id
      and audit_logs.order_id = p_order_id;

    if v_previous_result is null then
      raise exception 'O identificador da operacao ja foi usado em outro pedido.';
    end if;

    return v_previous_result;
  end if;

  update public.orders
  set
    assigned_operator = nullif(p_order ->> 'assignedOperator', ''),
    internal_notes = nullif(p_order ->> 'internalNotes', ''),
    operational_status = v_operational_status,
    payment_status = v_payment_status
  where orders.id = p_order_id;

  -- Estoque acompanha o status operacional: cancelar devolve, des-cancelar
  -- re-reserva. A flag stock_reserved dos itens torna os dois caminhos
  -- idempotentes mesmo combinados com o status interno 'recusado'.
  if v_previous_operational_status is distinct from 'cancelado' and v_operational_status = 'cancelado' then
    perform public.release_order_stock(p_order_id);
  elsif v_previous_operational_status = 'cancelado' and v_operational_status is distinct from 'cancelado' then
    perform public.reserve_order_stock(p_order_id);
  end if;

  update public.payments
  set
    paid_at = case
      when v_payment_status = 'pagamento_confirmado'
        and payments.status <> 'pagamento_confirmado' then now()
      when v_payment_status = 'pagamento_confirmado' then coalesce(payments.paid_at, now())
      else null
    end,
    provider = coalesce(nullif(p_payment ->> 'provider', ''), 'manual'),
    provider_reference = nullif(p_payment ->> 'providerReference', ''),
    status = v_payment_status
  where payments.order_id = p_order_id;

  get diagnostics v_payment_count = row_count;

  if v_payment_count = 0 then
    raise exception 'Pagamento do pedido nao encontrado.';
  end if;

  if p_supplier_purchase_id is not null then
    select supplier_purchases.id
    into v_supplier_purchase_id
    from public.supplier_purchases
    where supplier_purchases.id = p_supplier_purchase_id
      and supplier_purchases.order_id = p_order_id
    for update;

    if not found then
      raise exception 'A compra na origem nao pertence ao pedido selecionado.';
    end if;
  elsif p_supplier_purchase_id is null and p_supplier is not null then
    select supplier_purchases.id
    into v_supplier_purchase_id
    from public.supplier_purchases
    where supplier_purchases.order_id = p_order_id
    order by supplier_purchases.created_at
    limit 1
    for update;
  end if;

  if p_supplier is not null then
    insert into public.supplier_purchases (
      id,
      carrier,
      currency,
      exchange_rate,
      internal_channel,
      internal_notes,
      operational_account,
      order_id,
      product_cost_cents,
      proof_url,
      purchased_at,
      shipping_cost_cents,
      source_eta,
      source_order_number,
      source_product_url,
      source_status,
      source_store_name,
      tracking_code
    )
    values (
      coalesce(v_supplier_purchase_id, gen_random_uuid()),
      nullif(p_supplier ->> 'carrier', ''),
      coalesce(nullif(p_supplier ->> 'currency', ''), 'BRL'),
      nullif(p_supplier ->> 'exchangeRate', '')::numeric,
      nullif(p_supplier ->> 'internalChannel', ''),
      nullif(p_supplier ->> 'internalNotes', ''),
      nullif(p_supplier ->> 'operationalAccount', ''),
      p_order_id,
      nullif(p_supplier ->> 'productCostCents', '')::integer,
      nullif(p_supplier ->> 'proofUrl', ''),
      nullif(p_supplier ->> 'purchasedAt', '')::timestamptz,
      nullif(p_supplier ->> 'shippingCostCents', '')::integer,
      nullif(p_supplier ->> 'sourceEta', ''),
      nullif(p_supplier ->> 'sourceOrderNumber', ''),
      nullif(p_supplier ->> 'sourceProductUrl', ''),
      coalesce(nullif(p_supplier ->> 'sourceStatus', ''), 'nao_comprado'),
      nullif(p_supplier ->> 'sourceStoreName', ''),
      nullif(p_supplier ->> 'trackingCode', '')
    )
    on conflict (id) do update
    set
      carrier = excluded.carrier,
      currency = excluded.currency,
      exchange_rate = excluded.exchange_rate,
      internal_channel = excluded.internal_channel,
      internal_notes = excluded.internal_notes,
      operational_account = excluded.operational_account,
      product_cost_cents = excluded.product_cost_cents,
      proof_url = excluded.proof_url,
      purchased_at = excluded.purchased_at,
      shipping_cost_cents = excluded.shipping_cost_cents,
      source_eta = excluded.source_eta,
      source_order_number = excluded.source_order_number,
      source_product_url = excluded.source_product_url,
      source_status = excluded.source_status,
      source_store_name = excluded.source_store_name,
      tracking_code = excluded.tracking_code
    returning supplier_purchases.id into v_supplier_purchase_id;
  end if;

  if p_tracking is not null then
    insert into public.supplier_tracking_events (
      description,
      event_at,
      event_status,
      location,
      order_id,
      supplier_purchase_id
    )
    values (
      nullif(p_tracking ->> 'description', ''),
      coalesce(nullif(p_tracking ->> 'eventAt', '')::timestamptz, now()),
      coalesce(nullif(p_tracking ->> 'status', ''), v_operational_status),
      nullif(p_tracking ->> 'location', ''),
      p_order_id,
      v_supplier_purchase_id
    );
  end if;

  v_result := jsonb_build_object(
    'orderNumber', v_order_number,
    'supplierPurchaseId', v_supplier_purchase_id
  );

  update public.audit_logs
  set
    action = 'admin_order_updated',
    metadata = jsonb_build_object(
      'operationalStatus', v_operational_status,
      'orderNumber', v_order_number,
      'paymentStatus', v_payment_status,
      'result', v_result,
      'supplierPurchaseId', v_supplier_purchase_id
    )
  where audit_logs.id = v_audit_log_id;

  return v_result;
end;
$$;

-- Status interno em RPC transacional: 'recusado' libera a reserva efetiva do
-- pedido; sair de 'recusado' re-reserva com a mesma checagem do checkout.
create or replace function public.set_admin_internal_order_status(
  p_order_id uuid,
  p_internal_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_number text;
  v_previous_internal_status text;
begin
  if p_internal_status is null
    or p_internal_status not in ('pendente', 'confirmado', 'recusado') then
    raise exception 'Status interno invalido.';
  end if;

  select orders.order_number, orders.internal_order_status
  into v_order_number, v_previous_internal_status
  from public.orders
  where orders.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido nao encontrado.';
  end if;

  update public.orders
  set
    internal_order_status = p_internal_status,
    internal_order_status_updated_at = now()
  where orders.id = p_order_id;

  if v_previous_internal_status is distinct from 'recusado' and p_internal_status = 'recusado' then
    perform public.release_order_stock(p_order_id);
  elsif v_previous_internal_status = 'recusado' and p_internal_status is distinct from 'recusado' then
    perform public.reserve_order_stock(p_order_id);
  end if;

  insert into public.audit_logs (
    action,
    metadata,
    order_id
  )
  values (
    'admin_internal_order_status_updated',
    jsonb_build_object(
      'internalOrderStatus', p_internal_status,
      'orderNumber', v_order_number
    ),
    p_order_id
  );

  return jsonb_build_object(
    'internalOrderStatus', p_internal_status,
    'orderNumber', v_order_number
  );
end;
$$;

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

revoke all on function public.set_admin_internal_order_status(uuid, text) from public;
revoke all on function public.set_admin_internal_order_status(uuid, text) from anon;
revoke all on function public.set_admin_internal_order_status(uuid, text) from authenticated;
grant execute on function public.set_admin_internal_order_status(uuid, text) to service_role;
