-- Um pedido pode ter itens de LOJAS diferentes, e cada loja e uma compra
-- separada no fornecedor. Ate aqui o sistema assumia uma compra por pedido:
-- `automation_key` era `pedido:<id>` e unica, o painel lia so a primeira linha,
-- o rastreio publico usava `.limit(1)` e a RPC do admin gravava na compra mais
-- antiga. Esta migracao abre o modelo para N compras por pedido.
--
-- O que NAO muda: a automacao continua PREPARANDO a compra, nunca comprando.
-- Nenhuma credencial de fornecedor, nenhuma automacao de navegador.

begin;

-- ---------------------------------------------------------------------------
-- A loja vira parte da identidade da compra
-- ---------------------------------------------------------------------------

alter table public.supplier_purchases
  add column if not exists store_key text,
  -- Quando o operador confirmou a compra na origem. Diferente de `purchased_at`,
  -- que e a data que ELE digita: este e o carimbo do sistema, e e o que decide
  -- se ja da para avisar o cliente.
  add column if not exists confirmed_at timestamptz;

-- Compras que ja existem: deriva a chave do que foi digitado. Quem nao tem nome
-- de loja fica com `store_key` nulo, sai do indice unico parcial abaixo e nunca
-- colide com nada — e o comportamento certo para o pedido legado, que tem uma
-- compra so cobrindo o pedido inteiro.
update public.supplier_purchases
set store_key = public.build_supplier_store_key(internal_channel, source_store_name)
where store_key is null;

-- Uma compra por (pedido, loja). E este indice que torna o agrupamento uma
-- garantia do banco, e nao uma intencao da aplicacao.
create unique index if not exists supplier_purchases_order_store_idx
  on public.supplier_purchases (order_id, store_key)
  where store_key is not null;

-- ---------------------------------------------------------------------------
-- Qual item foi para qual compra
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_purchase_items (
  id uuid primary key default gen_random_uuid(),
  supplier_purchase_id uuid not null
    references public.supplier_purchases(id) on delete cascade,
  order_item_id uuid not null
    references public.order_items(id) on delete cascade,

  quantity integer not null,
  constraint supplier_purchase_items_quantity_check check (quantity > 0),

  -- SNAPSHOT do que valia quando a compra foi preparada. O produto pode trocar
  -- de fornecedor depois, e o registro precisa mostrar o que foi comprado de
  -- fato — mesma razao pela qual `order_items.unit_cost_cents` ja existe.
  source_product_url text,
  source_variation_label text,
  unit_cost_cents integer,
  constraint supplier_purchase_items_cost_check
    check (unit_cost_cents is null or unit_cost_cents >= 0),

  created_at timestamptz not null default now()
);

-- A INVARIANTE que sustenta o resto: cada item pertence a EXATAMENTE uma
-- compra. E o que faz o agrupamento ser uma particao de verdade, e o que impede
-- o mesmo item de entrar em duas compras quando o webhook chega repetido.
create unique index if not exists supplier_purchase_items_order_item_idx
  on public.supplier_purchase_items (order_item_id);

create index if not exists supplier_purchase_items_purchase_idx
  on public.supplier_purchase_items (supplier_purchase_id);

alter table public.supplier_purchase_items enable row level security;

revoke all on public.supplier_purchase_items from anon, authenticated;
grant select, insert, update, delete on public.supplier_purchase_items to service_role;

-- ---------------------------------------------------------------------------
-- O cliente e avisado uma vez por PEDIDO
-- ---------------------------------------------------------------------------

-- Em `orders`, e nao em `supplier_purchases`: o cliente recebe um aviso so,
-- mesmo com tres lojas. Gravar a marca antes de enviar e o que torna o envio
-- no maximo um, mesmo com dois saves simultaneos.
alter table public.orders
  add column if not exists purchase_confirmation_notified_at timestamptz;

-- ---------------------------------------------------------------------------
-- A lista de status sai do codigo e entra no banco
-- ---------------------------------------------------------------------------

-- Espelha `supplierSourceStatuses` de src/orders/status.js. Ate aqui a lista
-- valida existia so na aplicacao, entao qualquer escrita fora dela passava.
--
-- `not valid` de proposito: o banco de preview esta vazio, o que nao diz nada
-- sobre producao. A constraint ja vale para toda escrita NOVA; validar as
-- linhas antigas exige conferir producao primeiro, e isso vai numa migracao de
-- limpeza propria:
--   select distinct source_status from public.supplier_purchases;
--   alter table public.supplier_purchases
--     validate constraint supplier_purchases_source_status_check;
alter table public.supplier_purchases
  drop constraint if exists supplier_purchases_source_status_check;

alter table public.supplier_purchases
  add constraint supplier_purchases_source_status_check
  check (source_status in (
    'nao_comprado',
    'validando_origem',
    'comprado',
    'postado',
    'em_transito',
    'entregue',
    'problema',
    'cancelado'
  ))
  not valid;

commit;
