-- O admin passa a salvar UMA COMPRA POR LOJA.
--
-- O formulario de pedido tinha um bloco de "origem interna" so, com um
-- `supplierPurchaseId` escondido. Quando ele nao vinha, a RPC escolhia a compra
-- mais antiga do pedido (`order by created_at limit 1`) — o que, com duas
-- lojas, gravava o custo de uma na outra em silencio. Esse fallback morre aqui
-- junto com a suposicao de uma compra por pedido.
--
-- `drop function` da assinatura antiga e obrigatorio: sem ele o PostgREST ve
-- duas funcoes com o mesmo nome e responde "function is not unique".

begin;



create or replace function public.save_admin_order_operation(
  p_order_id uuid,
  p_order_number text,
  p_operation_id uuid,
  p_order jsonb,
  p_payment jsonb,
  p_suppliers jsonb,
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
  v_supplier_purchase_id uuid;
  v_supplier jsonb;
  v_supplier_id uuid;
  v_supplier_ids jsonb := '[]'::jsonb;
  v_tracking_purchase_id uuid;
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

  -- UMA compra por loja, entao o formulario manda um ARRAY. Antes vinha um
  -- objeto so, e quando nao vinha id a RPC pegava `order by created_at limit 1`
  -- — com duas lojas no pedido, isso gravava o custo de uma na outra. O
  -- fallback morreu junto com a suposicao de uma compra por pedido.
  for v_supplier in
    select * from jsonb_array_elements(coalesce(p_suppliers, '[]'::jsonb))
  loop
    v_supplier_id := nullif(v_supplier ->> 'id', '')::uuid;

    if v_supplier_id is not null then
      -- Sem esta checagem, um id trocado na requisicao gravaria na compra de
      -- OUTRO pedido. E a mesma guarda que ja existia, agora por bloco.
      select supplier_purchases.id
      into v_supplier_id
      from public.supplier_purchases
      where supplier_purchases.id = v_supplier_id
        and supplier_purchases.order_id = p_order_id
      for update;

      if not found then
        raise exception 'A compra na origem nao pertence ao pedido selecionado.';
      end if;
    end if;

    insert into public.supplier_purchases (
      id,
      carrier,
      confirmed_at,
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
      store_key,
      tracking_code
    )
    values (
      coalesce(v_supplier_id, gen_random_uuid()),
      nullif(v_supplier ->> 'carrier', ''),
      -- Carimbo do SISTEMA de quando a compra deixou de estar pendente. E ele
      -- que decide se ja da para avisar o cliente, e por isso nao pode ser a
      -- data que o operador digita em `purchased_at`.
      case
        when coalesce(nullif(v_supplier ->> 'sourceStatus', ''), 'nao_comprado')
             in ('nao_comprado', 'validando_origem', 'problema')
          then null
        else now()
      end,
      coalesce(nullif(v_supplier ->> 'currency', ''), 'BRL'),
      nullif(v_supplier ->> 'exchangeRate', '')::numeric,
      nullif(v_supplier ->> 'internalChannel', ''),
      nullif(v_supplier ->> 'internalNotes', ''),
      nullif(v_supplier ->> 'operationalAccount', ''),
      p_order_id,
      nullif(v_supplier ->> 'productCostCents', '')::integer,
      nullif(v_supplier ->> 'proofUrl', ''),
      nullif(v_supplier ->> 'purchasedAt', '')::timestamptz,
      nullif(v_supplier ->> 'shippingCostCents', '')::integer,
      nullif(v_supplier ->> 'sourceEta', ''),
      nullif(v_supplier ->> 'sourceOrderNumber', ''),
      nullif(v_supplier ->> 'sourceProductUrl', ''),
      coalesce(nullif(v_supplier ->> 'sourceStatus', ''), 'nao_comprado'),
      nullif(v_supplier ->> 'sourceStoreName', ''),
      -- A chave vem da MESMA funcao que a automacao usa para agrupar. Calcular
      -- aqui, e nao aceitar do formulario, e o que impede o operador de criar
      -- a mao uma segunda compra da loja que ja existe.
      public.build_supplier_store_key(
        nullif(v_supplier ->> 'internalChannel', ''),
        nullif(v_supplier ->> 'sourceStoreName', '')
      ),
      nullif(v_supplier ->> 'trackingCode', '')
    )
    on conflict (id) do update
    set
      carrier = excluded.carrier,
      -- Preserva o carimbo original: reabrir e fechar de novo nao pode
      -- reescrever quando a compra foi confirmada pela primeira vez.
      confirmed_at = coalesce(supplier_purchases.confirmed_at, excluded.confirmed_at),
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
      store_key = excluded.store_key,
      tracking_code = excluded.tracking_code
    returning supplier_purchases.id into v_supplier_purchase_id;

    v_supplier_ids := v_supplier_ids || to_jsonb(v_supplier_purchase_id);
  end loop;

  if p_tracking is not null then
    -- Com varias compras, o evento precisa dizer a QUAL envio ele pertence.
    -- Antes ele grudava na ultima compra gravada, que com duas lojas era so
    -- a que por acaso veio depois no formulario.
    v_tracking_purchase_id := nullif(p_tracking ->> 'supplierPurchaseId', '')::uuid;

    if v_tracking_purchase_id is not null then
      perform 1
      from public.supplier_purchases
      where supplier_purchases.id = v_tracking_purchase_id
        and supplier_purchases.order_id = p_order_id;

      if not found then
        raise exception 'O evento de rastreio aponta para uma compra de outro pedido.';
      end if;
    end if;

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
      v_tracking_purchase_id
    );
  end if;

  v_result := jsonb_build_object(
    'orderNumber', v_order_number,
    'supplierPurchaseIds', v_supplier_ids
  );

  update public.audit_logs
  set
    action = 'admin_order_updated',
    metadata = jsonb_build_object(
      'operationalStatus', v_operational_status,
      'orderNumber', v_order_number,
      'paymentStatus', v_payment_status,
      'result', v_result,
      'supplierPurchaseIds', v_supplier_ids
    )
  where audit_logs.id = v_audit_log_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ponte para o codigo que ainda esta no ar
-- ---------------------------------------------------------------------------
--
-- A assinatura antiga NAO e dropada. O codigo em producao chama esta funcao com
-- `p_supplier` + `p_supplier_purchase_id`, e os nomes dos parametros mudaram —
-- um `drop` aqui derrubaria o salvamento de pedidos no admin no instante em que
-- a migracao fosse aplicada, antes de o deploy acontecer.
--
-- A ponte converte a chamada antiga (uma compra) para o array que a versao
-- vigente espera, preservando ate o antigo fallback de "compra mais antiga do
-- pedido" — sem ele, cada save do codigo antigo criaria uma compra nova.
--
-- O PostgREST distingue as duas pelo conjunto de chaves do corpo, e isso foi
-- verificado contra o banco de preview com as duas formas de chamada.
--
-- PODE SER DROPADA depois que o codigo novo estiver no ar em todos os
-- ambientes:
--   drop function public.save_admin_order_operation(
--     uuid, text, uuid, jsonb, jsonb, uuid, jsonb, jsonb
--   );
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
  v_supplier_id uuid := p_supplier_purchase_id;
  v_suppliers jsonb := '[]'::jsonb;
begin
  if p_supplier is not null then
    if v_supplier_id is null then
      select supplier_purchases.id
      into v_supplier_id
      from public.supplier_purchases
      where supplier_purchases.order_id = p_order_id
      order by supplier_purchases.created_at
      limit 1;
    end if;

    v_suppliers := jsonb_build_array(
      p_supplier
      || case
           when v_supplier_id is null then '{}'::jsonb
           else jsonb_build_object('id', v_supplier_id)
         end
    );
  end if;

  return public.save_admin_order_operation(
    p_order_id,
    p_order_number,
    p_operation_id,
    p_order,
    p_payment,
    v_suppliers,
    p_tracking
  );
end;
$$;

commit;
