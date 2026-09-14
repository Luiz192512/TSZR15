-- Reponta os webhooks de revalidacao da URL da Vercel (conta bloqueada) para o
-- Worker da Cloudflare. Quando o dominio custom passar a servir o Worker, as
-- duas URLs valem.
--
-- ---------------------------------------------------------------------------
-- ATENCAO AO APLICAR
-- ---------------------------------------------------------------------------
--
-- `__REVALIDATE_SECRET__` e um PLACEHOLDER. Substitua pelo valor de
-- `REVALIDATE_SECRET` do ambiente ANTES de rodar, e nao versione o valor real:
-- o corpo do trigger fica legivel em `pg_trigger` e em
-- `supabase_migrations.schema_migrations`, entao o segredo ja vive em texto
-- puro dentro do banco. Colocar tambem no Git multiplicaria a exposicao.
--
-- A URL tambem muda por ambiente:
--   producao -> https://tsz-store.enz-luizgustavo.workers.dev/api/revalidate
--   staging  -> https://tsz-store-preview.enz-luizgustavo.workers.dev/api/revalidate
--
-- Esta migracao foi aplicada DIRETO no painel de producao em 2026-07-08 e nunca
-- foi versionada. O arquivo existe para que o repositorio pare de divergir do
-- banco no ar — foi reconstruido a partir do que a producao tem gravado, nao
-- reescrito. Ela NAO esta aplicada no projeto de preview: la o catalogo nao
-- dispara revalidacao de cache sozinho.
begin;

drop trigger if exists catalog_revalidate on public.catalog_products;
create trigger catalog_revalidate
  after insert or delete or update on public.catalog_products
  for each row execute function supabase_functions.http_request(
    'https://tsz-store.enz-luizgustavo.workers.dev/api/revalidate',
    'POST',
    '{"Content-type":"application/json","Authorization":"Bearer __REVALIDATE_SECRET__"}',
    '{}',
    '5000'
  );

drop trigger if exists stock_revalidate on public.catalog_variation_stock;
create trigger stock_revalidate
  after insert or delete or update on public.catalog_variation_stock
  for each row execute function supabase_functions.http_request(
    'https://tsz-store.enz-luizgustavo.workers.dev/api/revalidate',
    'POST',
    '{"Content-type":"application/json","Authorization":"Bearer __REVALIDATE_SECRET__"}',
    '{}',
    '5000'
  );

commit;
