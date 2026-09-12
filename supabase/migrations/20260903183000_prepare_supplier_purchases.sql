-- Prepara as compras na origem de um pedido pago, UMA POR LOJA.
--
-- Substitui `run_supplier_automation`, que criava uma compra so por pedido e
-- estava orfa: nada no app chamava, e a versao viva era a de
-- src/payments/supplier-automation.js, com quatro escritas separadas pelo
-- PostgREST. Eram duas implementacoes da mesma regra, ja divergentes. Esta
-- migracao deixa UMA.
--
-- Aqui precisa ser transacional de verdade: criar N compras, ligar os itens,
-- mover o status, registrar rastreio e auditoria sao um passo so. Uma falha no
-- meio, feita em chamadas separadas, deixaria pedido pago com status de "compra
-- pendente" e nenhuma compra registrada.
--
-- A automacao continua NAO COMPRANDO. Ela agrupa, deixa a lista pronta e avisa
-- a pessoa. Nenhuma credencial de fornecedor, nenhum navegador.

begin;

create or replace function public.prepare_supplier_purchases(
  p_order_id uuid,
  p_automation_prefix text
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
  v_grupo record;
  v_compra_id uuid;
  v_chave text;
  v_criadas integer := 0;
  v_compras jsonb := '[]'::jsonb;
begin
  if p_automation_prefix is null or length(trim(p_automation_prefix)) = 0 then
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
  -- tambem nao e pagamento. Preparar a compra antes de a loja ter o dinheiro e
  -- o prejuizo que esta guarda existe para evitar.
  if v_payment_status is distinct from 'pagamento_confirmado' then
    return jsonb_build_object(
      'aplicado', false,
      'motivo', 'pagamento_nao_confirmado',
      'paymentStatus', v_payment_status
    );
  end if;

  -- Um grupo por loja. Item cujo produto nao tem origem cadastrada cai em
  -- 'sem_loja', que e um grupo DE VERDADE: sem ele o item sumiria do
  -- agrupamento e ninguem compraria, com o pedido ja pago.
  for v_grupo in
    select
      coalesce(fonte.store_key, 'sem_loja') as chave,
      -- Dentro de um grupo o canal e o nome sao iguais por construcao: a chave
      -- e derivada justamente deles.
      min(fonte.internal_channel) as canal,
      min(fonte.source_store_name) as loja,
      -- URL na compra so quando o grupo inteiro aponta para o mesmo produto.
      -- Com varios, os links ficam nos itens, que e onde eles distinguem.
      case
        when count(distinct fonte.source_product_url) = 1
          then min(fonte.source_product_url)
        else null
      end as url
    from public.order_items oi
    left join lateral (
      select f.*
      from public.catalog_product_supplier_sources f
      where f.product_id = oi.product_id
        and f.is_active
        -- String vazia na origem significa "vale para todas". A ordenacao
        -- escolhe a origem MAIS ESPECIFICA quando existe mais de uma.
        and (f.variation = '' or f.variation = coalesce(oi.variation, ''))
        and (f.size = '' or f.size = coalesce(oi.size, ''))
      order by (f.variation <> '')::int + (f.size <> '')::int desc
      limit 1
    ) fonte on true
    where oi.order_id = p_order_id
    group by coalesce(fonte.store_key, 'sem_loja')
  loop
    v_chave := p_automation_prefix || ':loja:' || v_grupo.chave;
    v_compra_id := null;

    insert into public.supplier_purchases (
      order_id,
      created_by,
      automation_key,
      source_status,
      internal_channel,
      source_store_name,
      -- NULL para o grupo sem origem: nao existe loja, entao a linha fica fora
      -- do indice unico (order_id, store_key) e nao disputa com nada.
      store_key,
      source_product_url,
      internal_notes
    )
    values (
      p_order_id,
      'automacao',
      v_chave,
      'nao_comprado',
      v_grupo.canal,
      v_grupo.loja,
      nullif(v_grupo.chave, 'sem_loja'),
      v_grupo.url,
      case
        when v_grupo.chave = 'sem_loja'
          then 'Criada automaticamente. ATENCAO: itens sem origem cadastrada — defina o fornecedor no produto.'
        else 'Criada automaticamente na confirmacao do pagamento.'
      end
    )
    -- Idempotencia: webhook reenviado nao cria a segunda compra da mesma loja.
    on conflict (automation_key) where automation_key is not null do nothing
    returning supplier_purchases.id into v_compra_id;

    if v_compra_id is not null then
      v_criadas := v_criadas + 1;
    else
      select supplier_purchases.id
      into v_compra_id
      from public.supplier_purchases
      where supplier_purchases.automation_key = v_chave;
    end if;

    -- Liga os itens do grupo a compra, com SNAPSHOT do link: o produto pode
    -- trocar de fornecedor depois, e o registro precisa mostrar o que foi
    -- comprado de fato.
    insert into public.supplier_purchase_items (
      supplier_purchase_id,
      order_item_id,
      quantity,
      source_product_url,
      source_variation_label,
      unit_cost_cents
    )
    select
      v_compra_id,
      oi.id,
      oi.quantity,
      fonte.source_product_url,
      fonte.source_variation_label,
      coalesce(fonte.unit_cost_cents, oi.unit_cost_cents)
    from public.order_items oi
    left join lateral (
      select f.*
      from public.catalog_product_supplier_sources f
      where f.product_id = oi.product_id
        and f.is_active
        and (f.variation = '' or f.variation = coalesce(oi.variation, ''))
        and (f.size = '' or f.size = coalesce(oi.size, ''))
      order by (f.variation <> '')::int + (f.size <> '')::int desc
      limit 1
    ) fonte on true
    where oi.order_id = p_order_id
      and coalesce(fonte.store_key, 'sem_loja') = v_grupo.chave
    -- A invariante: um item pertence a exatamente uma compra. Na reentrega do
    -- webhook o item ja esta ligado e nada e refeito.
    on conflict (order_item_id) do nothing;

    v_compras := v_compras || jsonb_build_object(
      'storeKey', v_grupo.chave,
      'storeName', v_grupo.loja,
      'channel', v_grupo.canal,
      'supplierPurchaseId', v_compra_id
    );
  end loop;

  -- O status so AVANCA. Pedido que o operador ja moveu adiante — ou que entrou
  -- em estado de excecao — nao volta para "compra pendente".
  if v_operational_status in (
    'orcamento_iniciado',
    'enviado_whatsapp_business',
    'aguardando_atendimento',
    'dados_incompletos',
    'aguardando_pagamento',
    'pagamento_confirmado',
    'origem_interna_em_validacao'
  ) then
    update public.orders
    set operational_status = 'compra_interna_pendente'
    where orders.id = p_order_id;
  end if;

  if v_criadas > 0 then
    -- UM evento por pedido, nao um por loja. O cliente le esta tabela, e tres
    -- eventos iguais denunciariam que o pedido dele foi partido em tres
    -- compras em fornecedores diferentes.
    insert into public.supplier_tracking_events (
      description,
      event_at,
      event_status,
      order_id,
      supplier_purchase_id
    )
    values (
      'Pagamento confirmado. Separacao do pedido iniciada.',
      now(),
      'compra_interna_pendente',
      p_order_id,
      null
    );

    insert into public.audit_logs (action, metadata, order_id)
    values (
      'automacao_compra_interna_criada',
      jsonb_build_object(
        'automationPrefix', p_automation_prefix,
        'orderNumber', v_order_number,
        'statusAnterior', v_operational_status,
        'compras', v_compras
      ),
      p_order_id
    );
  end if;

  return jsonb_build_object(
    'aplicado', v_criadas > 0,
    'motivo', case when v_criadas > 0 then 'compras_preparadas' else 'ja_existia' end,
    'orderNumber', v_order_number,
    'criadas', v_criadas,
    'compras', v_compras
  );
end;
$$;

-- As duas funcoes antigas saem: `run_supplier_automation` foi substituida por
-- esta, e `revert_supplier_automation` nunca foi chamada — a versao viva do
-- desfazer e a de src/payments/supplier-automation.js. Deixar as duas no banco
-- recriaria a divergencia que esta migracao existe para acabar.
drop function if exists public.run_supplier_automation(uuid, text);
drop function if exists public.revert_supplier_automation(uuid, text);

commit;
