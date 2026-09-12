-- Origem de compra do produto: onde o operador compra cada item no fornecedor.
--
-- POR QUE UMA TABELA SEPARADA, e nao uma coluna em catalog_products:
-- `catalog_products` tem SELECT concedido a anon/authenticated de proposito
-- (ver 20260817120000_revoke_catalog_write_grants.sql, que revoga so a escrita),
-- e a policy "Public can view published catalog products" libera TODAS as
-- colunas das linhas publicadas. Hoje o link nao vaza apenas porque
-- `toPublicCatalogProduct` (src/catalog/index.js) remove os campos internos na
-- aplicacao — mas quem chamar o PostgREST direto com a chave publicavel passa
-- por cima desse filtro. Uma coluna nova ali nasceria publica.
--
-- Aqui vale o padrao de `catalog_product_costs`
-- (20260530134705_admin_pricing_coupons_storage.sql), cuja protecao tem tres
-- camadas independentes: RLS ligada SEM nenhuma policy, grant revogado para
-- anon/authenticated, e acesso so pelo cliente de service role.

-- Chave de agrupamento por loja. `immutable` porque entra em indice.
--
-- Sem `unaccent`: a extensao nunca foi usada neste projeto e nao vale uma
-- dependencia nova so para isto. `translate` cobre os acentos do portugues, que
-- e o alfabeto dos nomes de loja que o operador digita.
--
-- A MESMA normalizacao existe em JS (`normalizeStoreKey`, em
-- src/orders/supplier-store.js). As duas precisam concordar sempre: e a chave
-- que decide tanto o agrupamento quanto a idempotencia da automacao. Um teste
-- compara as duas implementacoes com a mesma lista de entradas.
create or replace function public.build_supplier_store_key(
  p_internal_channel text,
  p_store_name text
)
returns text
language sql
immutable
set search_path = ''
as $$
  with apelido as (
    select trim(
      both '-' from
      regexp_replace(
        translate(
          lower(trim(coalesce(p_store_name, ''))),
          'áàâãäéèêëíìîïóòôõöúùûüçñ',
          'aaaaaeeeeiiiiooooouuuucn'
        ),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    ) as valor
  )
  -- Apelido vazio devolve NULL, e nao "canal:". Um nome so de pontuacao ("---")
  -- produziria uma chave sem parte identificadora, e DUAS lojas assim
  -- colidiriam na mesma compra. Sem nome utilizavel, nao ha loja.
  select case
    when apelido.valor = '' then null
    else
      coalesce(nullif(lower(trim(coalesce(p_internal_channel, ''))), ''), 'outro')
      || ':'
      || apelido.valor
  end
  from apelido
$$;

create table if not exists public.catalog_product_supplier_sources (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.catalog_products(id) on delete cascade,

  -- String vazia significa "vale para qualquer variacao/tamanho". Nasce assim
  -- para que a origem possa comecar no nivel do produto e ser refinada depois
  -- sem migracao nova.
  variation text not null default '',
  size text not null default '',

  -- Mesmo CHECK de `supplier_purchases.internal_channel`, de proposito: o valor
  -- viaja do cadastro do produto ate a linha de compra sem tradução no meio.
  internal_channel text not null,
  constraint catalog_product_supplier_sources_channel_check
    check (internal_channel in ('shopee', 'aliexpress', 'fornecedor_homologado', 'outro')),

  source_store_name text not null,
  -- Gravado pela aplicacao usando build_supplier_store_key. Guardado em coluna
  -- em vez de calculado na leitura para que o agrupamento seja indexavel.
  store_key text not null,

  source_product_url text not null,
  -- Como a variacao se chama NO SITE DO FORNECEDOR ("Preto / M"), que quase
  -- nunca e o nome usado na loja.
  source_variation_label text,

  unit_cost_cents integer,
  constraint catalog_product_supplier_sources_cost_check
    check (unit_cost_cents is null or unit_cost_cents >= 0),

  is_active boolean not null default true,
  internal_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma origem ATIVA por combinacao. O indice parcial deixa historico inativo
-- conviver com a origem vigente, para trocar de fornecedor sem perder o registro
-- de onde o item vinha antes.
create unique index if not exists catalog_product_supplier_sources_active_idx
  on public.catalog_product_supplier_sources (product_id, variation, size)
  where is_active;

create index if not exists catalog_product_supplier_sources_product_idx
  on public.catalog_product_supplier_sources (product_id);

drop trigger if exists catalog_product_supplier_sources_set_updated_at
  on public.catalog_product_supplier_sources;

create trigger catalog_product_supplier_sources_set_updated_at
before update on public.catalog_product_supplier_sources
for each row execute function public.set_updated_at();

-- As tres camadas de protecao. Nenhuma policy e criada de proposito: mesmo que
-- um grant volte por engano, nao ha linha visivel para anon/authenticated.
alter table public.catalog_product_supplier_sources enable row level security;

revoke all on public.catalog_product_supplier_sources from anon, authenticated;
grant select, insert, update, delete on public.catalog_product_supplier_sources to service_role;
