-- Ajuste manual pos-venda. O valor que o cliente efetivamente paga e o custo
-- real do pedido variam na hora da compra, entao o operador corrige os dois no
-- painel depois de fechar. As colunas sao override: NULL significa "sem
-- ajuste", e a analise cai no valor derivado de hoje (total_cents para receita,
-- soma de supplier_purchases para custo). O cliente continua vendo total_cents.
alter table public.orders
  add column if not exists settled_total_cents integer
    constraint orders_settled_total_cents_non_negative
    check (settled_total_cents is null or settled_total_cents >= 0);

alter table public.orders
  add column if not exists settled_cost_cents integer
    constraint orders_settled_cost_cents_non_negative
    check (settled_cost_cents is null or settled_cost_cents >= 0);

comment on column public.orders.settled_total_cents is
  'Valor efetivamente recebido, ajustado no painel admin. NULL usa total_cents.';
comment on column public.orders.settled_cost_cents is
  'Custo total real do pedido, ajustado no painel admin. NULL usa a soma de supplier_purchases.';

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
    payment_status = v_payment_status,
    settled_total_cents = nullif(p_order ->> 'settledTotalCents', '')::integer,
    settled_cost_cents = nullif(p_order ->> 'settledCostCents', '')::integer
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
