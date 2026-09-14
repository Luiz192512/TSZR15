-- Automacao do fluxo de dropshipping: pagamento confirmado prepara a compra
-- interna, e reembolso/cancelamento desfaz o que a automacao criou.
--
-- Vive no BANCO, nao na aplicacao, porque o efeito precisa ser transacional:
-- criar a compra, mover o status, registrar o evento de rastreio e a auditoria
-- sao um passo so. Feito em quatro chamadas separadas pelo PostgREST, uma
-- falha no meio deixaria pedido com status de "compra pendente" e nenhuma
-- compra registrada — ou o contrario.
--
-- A automacao NUNCA compra no fornecedor. Ela prepara o trabalho, marca de
-- onde veio (`created_by = 'automacao'`) e avisa o humano.
--
-- ORDEM: aplicar primeiro no projeto de preview. Nada publicado hoje chama
-- estas funcoes, entao a migracao pode ir antes do deploy.
begin;

-- ---------------------------------------------------------------------------
-- Disparo: pagamento confirmado -> compra interna pendente
-- ---------------------------------------------------------------------------
create or replace function public.run_supplier_automation(
  p_order_id uuid,
  p_automation_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_number text;
  v_operational_status text;
  v_payment_status text;
  v_supplier_purchase_id uuid;
  v_criada boolean := false;
begin
  if p_automation_key is null or length(trim(p_automation_key)) = 0 then
    raise exception 'Chave de automacao ausente.';
  end if;

  select orders.order_number, orders.operational_status, orders.payment_status
  into v_order_number, v_operational_status, v_payment_status
  from public.orders
  where orders.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido nao encontrado.';
  end if;

  -- Cartao AUTORIZADO e dinheiro reservado, nao recebido; boleto em aberto
  -- tambem nao e pagamento. Comprar no fornecedor antes de a loja ter o
  -- dinheiro e exatamente o prejuizo que esta guarda existe para evitar.
  if v_payment_status is distinct from 'pagamento_confirmado' then
    return jsonb_build_object(
      'aplicado', false,
      'motivo', 'pagamento_nao_confirmado',
      'paymentStatus', v_payment_status
    );
  end if;

  -- Idempotencia: a UNIQUE parcial em automation_key impede a segunda compra
  -- quando o webhook chega repetido.
  insert into public.supplier_purchases (order_id, created_by, automation_key, source_status)
  values (p_order_id, 'automacao', p_automation_key, 'nao_comprado')
  on conflict (automation_key) where automation_key is not null do nothing
  returning supplier_purchases.id into v_supplier_purchase_id;

  if v_supplier_purchase_id is not null then
    v_criada := true;
  else
    select supplier_purchases.id
    into v_supplier_purchase_id
    from public.supplier_purchases
    where supplier_purchases.automation_key = p_automation_key;
  end if;

  -- O status so AVANCA. Se o operador ja moveu o pedido adiante (comprou,
  -- postou), a automacao atrasada nao pode puxar de volta para "pendente".
  if v_operational_status in (
    'orcamento_iniciado',
    'enviado_whatsapp_business',
    'aguardando_atendimento',
    'dados_incompletos',
    'aguardando_pagamento',
    'pagamento_confirmado'
  ) then
    update public.orders
    set operational_status = 'compra_interna_pendente'
    where orders.id = p_order_id;
  end if;

  if v_criada then
    insert into public.supplier_tracking_events (
      description,
      event_at,
      event_status,
      order_id,
      supplier_purchase_id
    )
    values (
      'Pagamento confirmado. Compra na origem pendente.',
      now(),
      'compra_interna_pendente',
      p_order_id,
      v_supplier_purchase_id
    );

    insert into public.audit_logs (action, metadata, order_id)
    values (
      'supplier_automation_started',
      jsonb_build_object(
        'automationKey', p_automation_key,
        'orderNumber', v_order_number,
        'statusAnterior', v_operational_status,
        'supplierPurchaseId', v_supplier_purchase_id
      ),
      p_order_id
    );
  end if;

  return jsonb_build_object(
    'aplicado', v_criada,
    'motivo', case when v_criada then 'compra_preparada' else 'ja_existia' end,
    'orderNumber', v_order_number,
    'supplierPurchaseId', v_supplier_purchase_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Desfazer: reembolso, estorno ou cancelamento
-- ---------------------------------------------------------------------------
create or replace function public.revert_supplier_automation(
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_number text;
  v_afetadas integer := 0;
begin
  select orders.order_number
  into v_order_number
  from public.orders
  where orders.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido nao encontrado.';
  end if;

  -- Desfaz SOMENTE o que a automacao criou e que ainda nao virou compra real.
  -- Compra que o operador ja executou no fornecedor tem dinheiro envolvido: o
  -- sistema nao pode apaga-la, so sinalizar para o humano decidir.
  update public.supplier_purchases
  set source_status = 'cancelado',
    internal_notes = concat_ws(
      ' | ',
      nullif(supplier_purchases.internal_notes, ''),
      concat('Automacao revertida: ', coalesce(p_reason, 'sem motivo informado'))
    )
  where supplier_purchases.order_id = p_order_id
    and supplier_purchases.created_by = 'automacao'
    and supplier_purchases.source_status in ('nao_comprado', 'validando_origem');

  get diagnostics v_afetadas = row_count;

  insert into public.supplier_tracking_events (
    description,
    event_at,
    event_status,
    order_id
  )
  values (
    concat('Automacao revertida: ', coalesce(p_reason, 'sem motivo informado')),
    now(),
    'cancelado',
    p_order_id
  );

  insert into public.audit_logs (action, metadata, order_id)
  values (
    'supplier_automation_reverted',
    jsonb_build_object(
      'comprasCanceladas', v_afetadas,
      'motivo', p_reason,
      'orderNumber', v_order_number
    ),
    p_order_id
  );

  return jsonb_build_object(
    'comprasCanceladas', v_afetadas,
    'orderNumber', v_order_number,
    'revertido', true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: so o service role do servidor executa
-- ---------------------------------------------------------------------------
revoke all on function public.run_supplier_automation(uuid, text) from public;
revoke all on function public.run_supplier_automation(uuid, text) from anon;
revoke all on function public.run_supplier_automation(uuid, text) from authenticated;
grant execute on function public.run_supplier_automation(uuid, text) to service_role;

revoke all on function public.revert_supplier_automation(uuid, text) from public;
revoke all on function public.revert_supplier_automation(uuid, text) from anon;
revoke all on function public.revert_supplier_automation(uuid, text) from authenticated;
grant execute on function public.revert_supplier_automation(uuid, text) to service_role;

commit;
