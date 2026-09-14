-- Base de dados para pagamento online, ledger financeiro e automacao de
-- fornecedor. Suporta as fases 4 a 8; nenhum codigo publicado hoje le ou
-- escreve o que esta sendo criado, entao a migracao pode ser aplicada antes do
-- deploy sem janela de indisponibilidade.
--
-- Aditiva por construcao: nenhuma coluna existente muda de tipo, nenhuma linha
-- e reescrita, e todo default preserva o comportamento atual. O unico DDL
-- destrutivo aparente e o CHECK de payments.status, que so AMPLIA o conjunto
-- aceito (os quatro valores antigos continuam validos).
--
-- ORDEM: aplicar primeiro no projeto de preview, exercitar o fluxo, e so
-- depois em producao. Ver docs/AMBIENTES.md.
--
-- Grants: tudo que carrega dinheiro, custo, taxa ou margem nasce FECHADO para
-- anon e authenticated, seguindo 20260807210000_revoke_internal_column_grants.
-- O app le e escreve essas tabelas por service role, que ignora RLS e grants.
begin;

-- ---------------------------------------------------------------------------
-- 1. payments: o que falta para um provedor externo
-- ---------------------------------------------------------------------------

-- Identificador da cobranca no provedor. Diferente de provider_reference, que
-- hoje e um campo livre preenchido a mao pelo operador no painel.
alter table public.payments
  add column if not exists provider_payment_id text;

-- Valor efetivamente LIQUIDADO e taxa cobrada. A margem se calcula sobre o
-- liquidado, nunca sobre o cobrado: cliente paga 300, a loja recebe 300 menos
-- a taxa do provedor.
alter table public.payments
  add column if not exists settled_amount_cents integer
  constraint payments_settled_amount_nonnegative
  check (settled_amount_cents is null or settled_amount_cents >= 0);

alter table public.payments
  add column if not exists provider_fee_cents integer not null default 0
  constraint payments_provider_fee_nonnegative check (provider_fee_cents >= 0);

alter table public.payments
  add column if not exists refunded_amount_cents integer not null default 0
  constraint payments_refunded_amount_nonnegative check (refunded_amount_cents >= 0);

-- Expiracao da cobranca Pix: passou disso, o QR nao serve mais.
alter table public.payments
  add column if not exists expires_at timestamptz;

-- Retorno bruto da criacao da cobranca (QR, ticket_url, status detalhado).
alter table public.payments
  add column if not exists provider_payload jsonb not null default '{}'::jsonb
  constraint payments_provider_payload_object check (jsonb_typeof(provider_payload) = 'object');

alter table public.payments
  add column if not exists updated_by text;

-- Estados que o Pix nao tem mas cartao e boleto tem. O CHECK antigo so
-- permitia quatro valores; os quatro seguem validos.
alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in (
    'aguardando_pagamento',
    'pagamento_confirmado',
    'cancelado',
    'reembolsado',
    'expirado',
    'autorizado',
    'recusado',
    'em_analise',
    'estornado',
    'reembolsado_parcial'
  ));

-- Idempotencia da cobranca: um pagamento por id de provedor.
create unique index if not exists payments_provider_payment_id_idx
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists payments_status_idx
  on public.payments (status)
  where status <> 'pagamento_confirmado';

-- ---------------------------------------------------------------------------
-- 2. Eventos de webhook: deduplicacao
-- ---------------------------------------------------------------------------
--
-- O provedor reenvia o mesmo evento em rajada e fora de ordem. A UNIQUE em
-- (provider, provider_event_id) e o que torna o processamento idempotente:
-- o segundo INSERT do mesmo evento falha e o handler devolve o resultado
-- anterior em vez de confirmar o pagamento de novo.
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text,
  payment_id uuid references public.payments(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  provider_payment_id text,
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  constraint payment_webhook_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create unique index if not exists payment_webhook_events_provider_event_idx
  on public.payment_webhook_events (provider, provider_event_id);

create index if not exists payment_webhook_events_order_idx
  on public.payment_webhook_events (order_id, received_at desc);

create index if not exists payment_webhook_events_pending_idx
  on public.payment_webhook_events (received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- 3. Ledger financeiro
-- ---------------------------------------------------------------------------
--
-- Uma linha por pedido. Nasce PROVISORIA na confirmacao do pagamento, com o
-- custo estimado de order_items.subtotal_cost_cents, e e reconciliada quando a
-- compra no fornecedor registra o custo real em supplier_purchases.
--
-- Margem negativa e resultado legitimo: o custo real pode superar o estimado.
-- Por isso nenhuma coluna de margem tem CHECK de nao-negatividade.
create table if not exists public.order_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  currency text not null default 'BRL',

  -- Dinheiro que entrou
  charged_amount_cents integer not null default 0
    check (charged_amount_cents >= 0),
  settled_amount_cents integer
    check (settled_amount_cents is null or settled_amount_cents >= 0),
  provider_fee_cents integer not null default 0
    check (provider_fee_cents >= 0),
  refunded_amount_cents integer not null default 0
    check (refunded_amount_cents >= 0),

  -- Dinheiro que sai para a operacao
  estimated_cost_cents integer not null default 0
    check (estimated_cost_cents >= 0),
  actual_cost_cents integer
    check (actual_cost_cents is null or actual_cost_cents >= 0),

  -- Resultado. Sem CHECK: prejuizo precisa poder ser gravado.
  provisional_margin_cents integer,
  reconciled_margin_cents integer,
  reconciled_at timestamptz,

  -- Repasse para a conta da empresa. O sistema NAO move dinheiro: ele calcula,
  -- registra a obrigacao e espera um humano confirmar a transferencia.
  payout_status text not null default 'pendente'
    check (payout_status in ('pendente', 'repassado', 'estornado', 'nao_aplicavel')),
  payout_amount_cents integer
    check (payout_amount_cents is null or payout_amount_cents >= 0),
  payout_at timestamptz,
  payout_reference text,
  payout_approved_by text,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Repasse executado exige quem aprovou e quando: sem isso a trilha de
  -- auditoria do dinheiro fica incompleta.
  constraint order_ledger_payout_requires_approval check (
    payout_status <> 'repassado'
    or (payout_at is not null and payout_approved_by is not null and payout_amount_cents is not null)
  )
);

create index if not exists order_ledger_payout_status_idx
  on public.order_ledger (payout_status)
  where payout_status = 'pendente';

create index if not exists order_ledger_payment_idx
  on public.order_ledger (payment_id);

drop trigger if exists order_ledger_set_updated_at on public.order_ledger;
create trigger order_ledger_set_updated_at
before update on public.order_ledger
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Automacao de fornecedor: idempotencia
-- ---------------------------------------------------------------------------
--
-- automation_key e a chave que impede a automacao de criar duas compras para o
-- mesmo pedido quando o webhook chega repetido. created_by separa o que foi
-- automatico do que o operador digitou, exigencia do painel na fase 6.
alter table public.supplier_purchases
  add column if not exists created_by text not null default 'manual'
  constraint supplier_purchases_created_by_check
  check (created_by in ('manual', 'automacao'));

alter table public.supplier_purchases
  add column if not exists automation_key text;

create unique index if not exists supplier_purchases_automation_key_idx
  on public.supplier_purchases (automation_key)
  where automation_key is not null;

-- ---------------------------------------------------------------------------
-- 5. Grants e RLS
-- ---------------------------------------------------------------------------
--
-- Tabelas novas carregam taxa, custo e margem. Nascem sem nenhum grant para
-- anon e authenticated; o acesso e exclusivamente por service role.
alter table public.payment_webhook_events enable row level security;
alter table public.order_ledger enable row level security;

revoke all on table public.payment_webhook_events from anon, authenticated;
revoke all on table public.order_ledger from anon, authenticated;

-- payments e supplier_purchases ja estavam fechadas (20260807210000). O revoke
-- e repetido porque as colunas novas herdam o grant da tabela: se um GRANT
-- amplo voltar no futuro, as colunas de taxa e margem iriam junto.
revoke all on table public.payments from anon, authenticated;
revoke all on table public.supplier_purchases from anon, authenticated;

commit;
